import type { SupabaseClient, User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';

export const DEFAULT_ORG_ID =
  process.env.DENVER_TRADES_DEFAULT_ORG_ID || 'd3b07384-d113-4e4e-9c8e-5b123d456789';

interface Profile {
  id: string;
  org_id: string;
  full_name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface UserContext {
  user: User;
  profile: Profile;
  orgId: string;
  supabase: SupabaseClient;
}

function userDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'Denver Trades User'
  );
}

export async function ensureUserProfile(user: User) {
  if (!user.email) {
    throw new Error('Authenticated user is missing an email address.');
  }

  const admin = getSupabaseServiceClient();

  await admin.from('organizations').upsert(
    {
      id: DEFAULT_ORG_ID,
      name: 'Sultan Trades',
      slug: 'sultan-trades',
      commodities: ['spices', 'grains', 'oilseeds'],
      target_markets: ['UAE', 'Saudi Arabia', 'Europe'],
      onboarding_complete: true,
    },
    { onConflict: 'id' }
  );

  const { data: existingProfile } = await admin
    .from('users')
    .select('id, org_id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle();

  const profilePayload = {
    id: user.id,
    org_id: existingProfile?.org_id || DEFAULT_ORG_ID,
    full_name: userDisplayName(user),
    email: user.email,
    role: existingProfile?.role || 'owner',
  };

  const { data, error } = await admin
    .from('users')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('id, org_id, full_name, email, role')
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

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

  return {
    user,
    profile,
    orgId: profile.org_id,
    supabase,
  };
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
