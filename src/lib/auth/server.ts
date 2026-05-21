import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';

export const DEFAULT_ORG_ID =
  process.env.DENVER_TRADES_DEFAULT_ORG_ID || 'd3b07384-d113-4e4e-9c8e-5b123d456789';

interface Profile {
  id: string;
  org_id: string;
  full_name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

/**
 * Same shape as `Profile` but with a nullable `org_id` — used during the
 * onboarding window between Google sign-in and the first `POST
 * /api/onboarding/org` call.
 */
export interface BareProfile {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  onboarding_step: number | null;
}

export interface UserContext {
  user: User;
  profile: Profile;
  orgId: string;
  supabase: SupabaseClient<Database>;
}

/**
 * For onboarding routes — the user is authenticated but does not yet have
 * an `org_id`. Anywhere else in the app should use `UserContext` instead.
 */
export interface OnboardingContext {
  user: User;
  profile: BareProfile;
  supabase: SupabaseClient<Database>;
}

function userDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Denver Trades User'
  );
}

/**
 * Make sure a `users` row exists for this auth user. Does NOT auto-assign
 * an org_id — new users land with `org_id = null` and walk through the
 * `/onboarding` wizard to create one. The legacy DEFAULT_ORG_ID upsert was
 * removed in 2026-05-22; existing users with an org_id are untouched.
 */
export async function ensureUserProfile(user: User): Promise<BareProfile> {
  if (!user.email) {
    throw new Error('Authenticated user is missing an email address.');
  }

  const admin = getSupabaseServiceClient();

  const { data: existingProfile } = await admin
    .from('users')
    .select('id, org_id, full_name, email, role, onboarding_step')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfile) {
    return existingProfile as BareProfile;
  }

  const insertPayload = {
    id: user.id,
    org_id: null,
    full_name: userDisplayName(user),
    email: user.email,
    role: 'member' as const,
    onboarding_step: 1,
  };

  const { data, error } = await admin
    .from('users')
    .insert(insertPayload)
    .select('id, org_id, full_name, email, role, onboarding_step')
    .single();

  if (error) {
    throw error;
  }

  return data as BareProfile;
}

/**
 * Resolve the signed-in user and their org. Returns null if the user is
 * not authenticated OR if they have not yet completed onboarding (no
 * org_id). Onboarding routes should use `getOnboardingContext()` instead.
 */
export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const profile = await ensureUserProfile(user);

  if (!profile.org_id) {
    return null;
  }

  return {
    user,
    profile: {
      id: profile.id,
      org_id: profile.org_id,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
    },
    orgId: profile.org_id,
    supabase,
  };
}

/**
 * For the `/onboarding` flow and its API routes. Returns the authenticated
 * user + their (possibly org-less) profile + a Supabase client. Returns
 * null only when the user is not signed in at all.
 */
export async function getOnboardingContext(): Promise<OnboardingContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const profile = await ensureUserProfile(user);

  return { user, profile, supabase };
}

export async function requireUserContext() {
  const context = await getUserContext();

  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  return { context, response: null };
}

/**
 * Onboarding-route equivalent of `requireUserContext`. Allows the request
 * through if the user is signed in even when they don't have an org yet.
 */
export async function requireOnboardingContext() {
  const context = await getOnboardingContext();

  if (!context) {
    return {
      context: null,
      response: NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      ),
    };
  }

  return { context, response: null };
}
