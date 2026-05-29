/**
 * Central error capture. Always emits a structured log (visible in Vercel logs,
 * groupable), and — when `ERROR_WEBHOOK_URL` is set — pushes a real-time alert to
 * a Slack/Discord incoming webhook so a solo operator KNOWS the moment something
 * breaks for a pilot user instead of them silently churning.
 *
 * Deliberately dependency-free + build-safe (no config wrapping). Swapping in
 * @sentry/nextjs later is a drop-in: add the SDK and call it from here. The
 * payload is shaped to satisfy both Slack (`text`) and Discord (`content`).
 */
export interface ErrorContext {
  /** Logical source, e.g. 'api/assistant' or 'webhook/apify'. */
  route?: string;
  orgId?: string;
  userId?: string;
  [key: string]: unknown;
}

function summarize(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

export async function captureError(error: unknown, context: ErrorContext = {}): Promise<void> {
  const { message, stack } = summarize(error);
  const route = context.route ?? 'unknown';

  // 1. Always structured-log (Vercel log drains / search).
  console.error(
    '[capture]',
    JSON.stringify({
      level: 'error',
      route,
      message,
      context,
      at: new Date().toISOString(),
    }),
  );

  // 2. Best-effort real-time alert.
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  const ctxLine = Object.entries(context)
    .filter(([k, v]) => k !== 'route' && v != null)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
  const text =
    `🔴 *Denver Trades error* \`${route}\`\n${message}` +
    (ctxLine ? `\n${ctxLine}` : '') +
    (stack ? `\n\`\`\`${stack.split('\n').slice(0, 4).join('\n')}\`\`\`` : '');

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }),
    });
  } catch (e) {
    console.error('[capture] alert webhook failed:', e);
  }
}
