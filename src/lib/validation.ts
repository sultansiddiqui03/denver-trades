import { NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';

export type ParseBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Parse + validate a JSON request body against a zod schema.
 * Returns either the typed data or a ready-to-return 400 response with field-level errors.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<ParseBodyResult<T>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Invalid request body', issues },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: result.data };
}
