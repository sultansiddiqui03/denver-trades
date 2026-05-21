import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import type { TablesInsert } from '@/lib/supabase/database.types';

type OrgInsert = TablesInsert<'organizations'>;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const COMMODITY_OPTIONS = [
  'Spices',
  'Coffee',
  'Tea',
  'Cashew',
  'Pulses',
  'Grains',
  'Cardamom',
  'Pepper',
  'Saffron',
  'Cinnamon',
  'Rice',
  'Dried Fruits',
  'Nuts',
  'Other',
] as const;

const MARKET_OPTIONS = [
  'UAE',
  'Saudi Arabia',
  'India',
  'Vietnam',
  'Brazil',
  'Turkey',
  'Indonesia',
  'Germany',
  'USA',
  'UK',
  'France',
  'Singapore',
  'Japan',
  'China',
  'Other',
] as const;

const CreateOrgSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'slug must be at least 2 chars')
    .max(100)
    .refine((v) => SLUG_PATTERN.test(v), {
      message: 'slug must be lowercase letters, digits, or single dashes',
    }),
  commodities: z.array(z.enum(COMMODITY_OPTIONS)).min(1, 'select at least one commodity').max(14),
  target_markets: z.array(z.enum(MARKET_OPTIONS)).max(15).optional().default([]),
});

function randomSuffix(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Onboarding Step 1 — Create the organization and link the signed-in user to
 * it as the Owner. Uses the service-role client because the user has no
 * `org_id` yet, so RLS would reject a user-context insert. Same auth boundary
 * as a webhook receiver: we have already verified the caller via
 * `requireOnboardingContext`.
 */
export async function POST(request: Request) {
  try {
    const { context, response } = await requireOnboardingContext();
    if (!context) return response;

    const parsed = await parseBody(request, CreateOrgSchema);
    if (!parsed.ok) return parsed.response;

    const { user, profile } = context;
    const body = parsed.data;

    // Idempotency: if the user already has an org, don't let them create a
    // second one through this endpoint. They should be on /dashboard.
    if (profile.org_id) {
      return NextResponse.json(
        { success: false, error: 'You already belong to an organization' },
        { status: 409 }
      );
    }

    const admin = getSupabaseServiceClient();

    const buildInsert = (slug: string): OrgInsert => ({
      name: body.name,
      slug,
      commodities: body.commodities,
      target_markets: body.target_markets ?? [],
      onboarding_complete: false,
    });

    // First attempt with the user's preferred slug; on Postgres
    // unique_violation (23505) append a 4-digit suffix and retry once.
    let inserted: { id: string; slug: string } | null = null;
    let lastError: unknown = null;
    const slugAttempts = [body.slug, `${body.slug}-${randomSuffix()}`];
    for (const slug of slugAttempts) {
      const { data, error } = await admin
        .from('organizations')
        .insert(buildInsert(slug))
        .select('id, slug')
        .single();

      if (!error && data) {
        inserted = data;
        break;
      }

      lastError = error;
      if (error?.code !== '23505') break;
    }

    if (!inserted) {
      throw lastError ?? new Error('Failed to create organization');
    }

    // Link the user to their new org. Bumping `onboarding_step` to 2 so the
    // wizard's reload-resume path knows where to land if the user closes the
    // tab between steps.
    const { error: linkError } = await admin
      .from('users')
      .update({
        org_id: inserted.id,
        role: 'owner',
        onboarding_step: 2,
      })
      .eq('id', user.id);

    if (linkError) {
      throw linkError;
    }

    return NextResponse.json({
      success: true,
      org: {
        id: inserted.id,
        name: body.name,
        slug: inserted.slug,
      },
    });
  } catch (error: unknown) {
    console.error('POST /api/onboarding/org error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
