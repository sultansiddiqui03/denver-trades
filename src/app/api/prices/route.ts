import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { runPriceIngest } from '@/lib/agents/priceIngest';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isCron = searchParams.get('cron') === 'true';

    if (isCron) {
      if (!isAutomationAuthorized(request)) {
        return NextResponse.json(
          { success: false, error: 'Cron authorization failed' },
          { status: 401 }
        );
      }
      return await triggerVolatilityTick();
    }

    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { supabase } = context;

    const { data: prices, error } = await supabase
      .from('commodity_prices')
      .select('*')
      .order('commodity', { ascending: true })
      .order('recorded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      prices
    });
  } catch (error: unknown) {
    console.error('Prices API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

// Simulates a cron job to update prices with minor market volatility
export async function POST() {
  const { context, response } = await requireUserContext();
  if (!context) return response;

  return await triggerVolatilityTick();
}

async function triggerVolatilityTick() {
  try {
    const result = await runPriceIngest();
    return NextResponse.json({
      success: true,
      message: 'Simulated price feed tick triggered.',
      processed: result.processed,
      created: result.created,
    });
  } catch (error: unknown) {
    console.error('Price Ingest trigger error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
