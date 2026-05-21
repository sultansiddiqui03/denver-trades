import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { fetchAnalyticsData } from '@/lib/dashboard/analyticsData';

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const analytics = await fetchAnalyticsData(context);

    return NextResponse.json({
      success: true,
      analytics,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
