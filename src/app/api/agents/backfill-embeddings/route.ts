import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';

/**
 * User-context proxy to `/api/admin/embeddings/backfill`.
 *
 * Why this exists: the admin endpoint is Bearer-authed via `CRON_SECRET`,
 * which the browser never sees. Without this proxy a signed-in user would
 * have to copy CRON_SECRET out of Vercel env to a terminal and run curl.
 *
 * This route checks the user is signed in (any org member can trigger),
 * then calls the admin endpoint server-side with the secret from env.
 *
 * The backfill scans across all orgs (service-role bypasses RLS in the
 * admin endpoint) but only operates on rows that explicitly have
 * `embedding IS NULL` — no cross-tenant write risk.
 */
function publicBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        {
          success: false,
          error:
            'CRON_SECRET not configured. Set it in Vercel env vars to enable backfill.',
        },
        { status: 503 }
      );
    }

    // Accept an optional { limit } body; pass through verbatim.
    let body: Record<string, unknown> = {};
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      try {
        body = await request.json();
      } catch {
        // Bad JSON — treat as no override.
      }
    }

    const adminUrl = `${publicBaseUrl()}/api/admin/embeddings/backfill`;
    const adminResponse = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!adminResponse.ok) {
      const errText = await adminResponse.text();
      // 404 = endpoint not deployed yet (older preview, etc.) — tolerate.
      if (adminResponse.status === 404) {
        return NextResponse.json(
          {
            success: false,
            notDeployed: true,
            error: 'Admin endpoint not available on this deployment.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: `Admin backfill failed (${adminResponse.status}): ${errText}`,
        },
        { status: 502 }
      );
    }

    const data = (await adminResponse.json()) as Record<string, unknown>;
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('POST /api/agents/backfill-embeddings error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
