import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isWebhookSecretAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';

const ApifyWebhookSchema = z.object({
  runId: z.string().optional(),
  event: z.string().min(1, 'event is required'),
  datasetId: z.string().min(1, 'datasetId is required'),
});

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
  const supabase = getSupabaseServiceClient();

  try {
    if (!isWebhookSecretAuthorized(request, 'APIFY_WEBHOOK_SECRET')) {
      return NextResponse.json(
        { success: false, error: 'Webhook authorization failed' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const agentRunId = searchParams.get('agent_run_id');

    if (!agentRunId) {
      return NextResponse.json({ success: false, error: 'agent_run_id is required' }, { status: 400 });
    }

    const parsed = await parseBody(request, ApifyWebhookSchema);
    if (!parsed.ok) return parsed.response;
    const { event, datasetId } = parsed.data;

    console.log(`Apify Webhook triggered for Run ID: ${agentRunId}. Event: ${event}, Dataset ID: ${datasetId}`);

    const { data: runRecord, error: runFetchError } = await supabase
      .from('agent_runs')
      .select('id, org_id, status')
      .eq('id', agentRunId)
      .single();

    if (runFetchError || !runRecord) {
      return NextResponse.json({ success: false, error: 'Agent run not found' }, { status: 404 });
    }

    const orgId = runRecord.org_id;

    // P1-4: idempotent on replay. If the run already reached a terminal state, just
    // ACK so Apify stops retrying — re-processing would duplicate company rows.
    if (runRecord.status === 'Success' || runRecord.status === 'Failed') {
      console.info(`Apify webhook: run ${agentRunId} already ${runRecord.status}; ignoring replay.`);
      return NextResponse.json({ success: true, message: 'Run already terminal — replay ignored' });
    }

    // P1-14: never trust an org_id from the payload; use the value joined from the
    // verified agent_runs record only.

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

    const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
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

  } catch (error: unknown) {
    console.error('Apify Webhook error:', error);
    
    // Attempt to log failure in database
    const { searchParams } = new URL(request.url);
    const agentRunId = searchParams.get('agent_run_id');
    if (agentRunId) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: getErrorMessage(error),
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);
    }

    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
