import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isCron = searchParams.get('cron') === 'true';

    if (isCron) {
      return await triggerVolatilityTick();
    }

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
  } catch (error: any) {
    console.error('Prices API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// Simulates a cron job to update prices with minor market volatility
export async function POST() {
  return await triggerVolatilityTick();
}

async function triggerVolatilityTick() {
  try {
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
  } catch (error: any) {
    console.error('Price Ingest trigger error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
