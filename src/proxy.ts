import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);
  const path = request.nextUrl.pathname;
  const isDashboardRoute = path.startsWith('/dashboard');
  const isOnboardingRoute = path === '/onboarding' || path.startsWith('/onboarding/');

  if ((isDashboardRoute || isOnboardingRoute) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('next', `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (path === '/' && user) {
    // Onboarding-aware routing happens in the dashboard layout — bouncing
    // to /dashboard is fine, that layout will redirect to /onboarding if
    // the user hasn't finished setting up an org yet.
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/onboarding', '/onboarding/:path*'],
};
