import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

const FavoriteSchema = z.object({
  companyId: z.string().uuid('companyId must be a UUID'),
  favorited: z.boolean(),
});

/**
 * Persist the star/unstar toggle on a company. The search page already
 * does the optimistic UI flip; this is the durable write.
 */
export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    const parsed = await parseBody(request, FavoriteSchema);
    if (!parsed.ok) return parsed.response;
    const { companyId, favorited } = parsed.data;

    const { error } = await supabase
      .from('companies')
      .update({ is_favorited: favorited })
      .eq('id', companyId)
      .eq('org_id', orgId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Favorite API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
