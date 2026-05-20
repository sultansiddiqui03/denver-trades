import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let serviceClient: SupabaseClient<Database> | null = null;

export function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service credentials are not configured.');
  }

  if (!serviceClient) {
    serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
}
