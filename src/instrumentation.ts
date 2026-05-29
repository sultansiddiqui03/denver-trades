import { captureError } from '@/lib/observability/capture';

/**
 * Next.js instrumentation. `register` is a no-op for now (a place to init a
 * tracing SDK later). `onRequestError` is Next's built-in hook that fires on any
 * UNCAUGHT server error — routed through our central capture so it alerts +
 * logs. (Routes that catch their own errors call captureError directly.)
 */
export async function register(): Promise<void> {
  // Reserved for future tracing/init.
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
): Promise<void> {
  await captureError(error, { route: request?.path ?? 'request', method: request?.method });
}
