import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { fetchDashboardStats } from '@/lib/dashboard/statsData';

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const stats = await fetchDashboardStats(context);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: unknown) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
