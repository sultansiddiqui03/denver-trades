import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';

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
    const supabase = getSupabaseServiceClient();
    const { data: prices, error: fetchError } = await supabase
      .from('commodity_prices')
      .select('*');

    if (fetchError) throw fetchError;

    const updates = [];
    for (const feed of prices) {
      // Calculate a random price fluctuation between -1.5% and +1.5%
      const volatility = 1 + (Math.random() * 0.03 - 0.015);
      const newPrice = Math.round(Number(feed.price_usd) * volatility * 100) / 100;

      const { data: updatedFeed, error: updateError } = await supabase
        .from('commodity_prices')
        .insert({
          commodity: feed.commodity,
          origin_country: feed.origin_country,
          price_usd: newPrice,
          unit: feed.unit,
          source: feed.source,
          recorded_at: new Date().toISOString()
        })
        .select()
        .single();

      if (updateError) throw updateError;
      updates.push(updatedFeed);
    }

    return NextResponse.json({
      success: true,
      message: 'Simulated price feed tick triggered.',
      updatedFeeds: updates
    });
  } catch (error: unknown) {
    console.error('Price Ingest trigger error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
