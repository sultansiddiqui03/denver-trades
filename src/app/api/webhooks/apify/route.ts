import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateJSON } from '@/lib/ai/gemini';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ScrapedPlace {
  title?: string;
  categoryName?: string;
  website?: string;
  phone?: string;
  city?: string;
  countryCode?: string;
  street?: string;
  address?: string;
  description?: string;
}

interface EnrichedCompany {
  name: string;
  type: 'Importer' | 'Exporter' | 'Broker';
  hq_country: string;
  hq_city: string;
  origin_countries: string[];
  destination_countries: string[];
  products_dealt: string[];
  website?: string;
  description?: string;
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentRunId = searchParams.get('agent_run_id');
    const orgId = 'd3b07384-d113-4e4e-9c8e-5b123d456789'; // Default Org ID

    if (!agentRunId) {
      return NextResponse.json({ success: false, error: 'agent_run_id is required' }, { status: 400 });
    }

    const payload = await request.json();
    const { runId, event, datasetId } = payload;

    console.log(`Apify Webhook triggered for Run ID: ${agentRunId}. Event: ${event}, Dataset ID: ${datasetId}`);

    // If the run failed, update agent run and exit
    if (event !== 'ACTOR.RUN.SUCCEEDED') {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: `Apify execution failed. Event trigger: ${event}`,
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);

      return NextResponse.json({ success: true, message: 'Updated run to failed state' });
    }

    const token = process.env.APIFY_TOKEN;
    if (!token) {
      throw new Error('APIFY_TOKEN is missing in environment variables');
    }

    // 1. Fetch dataset results from Apify
    const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
    const datasetResponse = await fetch(datasetUrl);
    if (!datasetResponse.ok) {
      throw new Error(`Failed to fetch Apify dataset items: ${await datasetResponse.text()}`);
    }

    const items: ScrapedPlace[] = await datasetResponse.json();
    console.log(`Fetched ${items.length} items from Apify dataset ${datasetId}`);

    if (items.length === 0) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: 0,
          records_created: 0,
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);

      return NextResponse.json({ success: true, message: 'No items to process' });
    }

    // 2. Parse and enrich the top 5 crawled items using Gemini to keep database clean and performant
    const itemsToProcess = items.slice(0, 5);
    let createdCount = 0;

    for (const item of itemsToProcess) {
      try {
        const systemPrompt = `You are a B2B trade intelligence enrichment system. 
Analyze the raw scraped business record and transform it into a structured B2B Company record.
Clean company name (remove random suffixes). 
Classify type as 'Importer' if they buy or import, 'Exporter' if they sell, distribute, or grow, or 'Broker' as fallback.
Output JSON schema matching:
{
  "name": "Clean Company Name",
  "type": "Importer" | "Exporter" | "Broker",
  "hq_country": "Country Name (resolve country code)",
  "hq_city": "City Name",
  "origin_countries": ["array of countries they source from"],
  "destination_countries": ["array of countries they sell to"],
  "products_dealt": ["array of products like Pepper, Spices, Grains"],
  "website": "url if valid, or null",
  "description": "A high-quality 2-3 sentence overview of this business based on the crawl data."
}`;

        const promptText = `Analyze and structure the following scraped business details:
Name: ${item.title || 'Unknown'}
Website: ${item.website || 'N/A'}
Category: ${item.categoryName || 'N/A'}
Phone: ${item.phone || 'N/A'}
Address: ${item.address || item.street || 'N/A'}
City: ${item.city || 'N/A'}
Country Code: ${item.countryCode || 'N/A'}`;

        const enriched: EnrichedCompany = await generateJSON<EnrichedCompany>(promptText, systemPrompt);

        // Save contacts details inside JSONB contacts field
        const contacts = item.phone ? [{ name: 'Main Office', phone: item.phone, email: null }] : [];

        // Insert into database
        const { error: dbError } = await supabase
          .from('companies')
          .insert({
            org_id: orgId,
            name: enriched.name,
            type: enriched.type,
            hq_country: enriched.hq_country,
            hq_city: enriched.hq_city,
            origin_countries: enriched.origin_countries,
            destination_countries: enriched.destination_countries,
            products_dealt: enriched.products_dealt,
            website: enriched.website || null,
            description: enriched.description || 'Scraped and enriched via Apify Lead Scraper.',
            contacts: contacts,
            is_enriched: true,
            enriched_at: new Date().toISOString(),
            confidence_score: 0.92
          });

        if (dbError) {
          console.error(`Error saving enriched company ${enriched.name}:`, dbError);
        } else {
          createdCount++;
        }
      } catch (enrichError) {
        console.error('Failed to enrich scraped item:', item, enrichError);
      }
    }

    // 3. Mark the agent run as Success in Supabase
    await supabase
      .from('agent_runs')
      .update({
        status: 'Success',
        records_processed: items.length,
        records_created: createdCount,
        completed_at: new Date().toISOString()
      })
      .eq('id', agentRunId);

    return NextResponse.json({
      success: true,
      processed: items.length,
      created: createdCount
    });

  } catch (error: any) {
    console.error('Apify Webhook error:', error);
    
    // Attempt to log failure in database
    const { searchParams } = new URL(request.url);
    const agentRunId = searchParams.get('agent_run_id');
    if (agentRunId) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: error.message || 'Internal Server Webhook Error',
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
