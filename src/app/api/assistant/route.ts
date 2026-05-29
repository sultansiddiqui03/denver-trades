import { streamText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { buildAssistantTools } from '@/lib/assistant/tools';
import { captureError } from '@/lib/observability/capture';

// AI SDK reads ANTHROPIC_API_KEY; mirror our CLAUDE_API_KEY (same as claude.ts).
if (process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
}

const MODEL_ID = 'claude-sonnet-4-6';
const HISTORY_LIMIT = 16;

export const maxDuration = 300;

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

/** Load the user's recent assistant conversation (chronological) = memory. */
export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from('assistant_messages')
      .select('id, role, content, created_at')
      .eq('user_id', context.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const messages = (data ?? []).reverse();
    return Response.json({ success: true, messages });
  } catch (error: unknown) {
    return Response.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { context, response } = await requireUserContext();
  if (!context) return response;

  const parsed = await parseBody(request, ChatSchema);
  if (!parsed.ok) return parsed.response;

  if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { success: false, error: 'The assistant needs CLAUDE_API_KEY configured.' },
      { status: 503 },
    );
  }

  const { orgId, user } = context;
  const userMessage = parsed.data.message;
  const supabase = getSupabaseServiceClient();

  // Live workspace snapshot for baseline awareness (tools fetch detail on demand).
  const [{ data: org }, companiesCount, dealsCount, oppsCount, history] = await Promise.all([
    supabase.from('organizations').select('name, commodities, target_markets').eq('id', orgId).maybeSingle(),
    supabase.from('companies').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('deals_pipeline').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['new', 'viewed']),
    supabase
      .from('assistant_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const priorMessages = (history.data ?? [])
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const system = `You are the Denver Trades assistant — an AI trade-intelligence copilot for a B2B commodity exporter. You help the user find buyers, understand markets, manage their pipeline, and draft outreach, and you can RUN real agents via your tools (discover buyers from live customs data, pull market intelligence, search companies, list/create deals, draft outreach).

Guidelines:
- Be concise, warm, and action-oriented. Lead with the answer.
- When a request maps to a tool, USE the tool and report the concrete result (real names, counts, prices). Never invent buyers, prices, or contacts — only state figures returned by tools or present in the snapshot.
- You may chain tools (e.g. discover buyers → then draft outreach for the top one) when it clearly helps.
- If a tool returns nothing or an error, say so plainly and suggest an alternative.
- Remember the conversation: the user's prior messages are included. Reference earlier context naturally.
- After acting, suggest one sensible next step.

Workspace snapshot:
- Organization: ${org?.name ?? 'Unknown'}
- Sells / trades: ${(org?.commodities ?? []).join(', ') || 'not set'}
- Target markets: ${(org?.target_markets ?? []).join(', ') || 'not set'}
- Companies on file: ${companiesCount.count ?? 0} · Deals: ${dealsCount.count ?? 0} · Open opportunities: ${oppsCount.count ?? 0}
- Today: ${new Date().toISOString().slice(0, 10)}`;

  // Persist the user's message (memory) before we stream the reply.
  await supabase.from('assistant_messages').insert({ org_id: orgId, user_id: user.id, role: 'user', content: userMessage });

  try {
    const result = streamText({
      model: anthropic(MODEL_ID),
      system,
      messages: [...priorMessages, { role: 'user' as const, content: userMessage }],
      tools: buildAssistantTools(supabase, orgId),
      stopWhen: stepCountIs(6),
      onFinish: async ({ text }) => {
        const reply = text?.trim();
        if (reply) {
          await supabase
            .from('assistant_messages')
            .insert({ org_id: orgId, user_id: user.id, role: 'assistant', content: reply });
        }
      },
    });
    return result.toTextStreamResponse();
  } catch (error: unknown) {
    await captureError(error, { route: 'api/assistant', orgId, userId: user.id });
    return Response.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
