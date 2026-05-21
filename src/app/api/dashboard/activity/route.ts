import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { fetchActivityFeed } from '@/lib/dashboard/activityData';

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const activities = await fetchActivityFeed(context);

    return NextResponse.json({
      success: true,
      activities,
    });
  } catch (error: unknown) {
    console.error('Activity feed error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
