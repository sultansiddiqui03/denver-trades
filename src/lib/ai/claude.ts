import { generateText as sdkGenerateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const apiKey = process.env.CLAUDE_API_KEY;

// P2-1: migrated to Vercel AI SDK v6. The Anthropic provider reads
// ANTHROPIC_API_KEY from env at runtime; mirror CLAUDE_API_KEY into it so
// we keep the existing env-var name in Vercel.
if (apiKey && !process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = apiKey;
}

export async function generateText(prompt: string, system?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is not configured.');
  }

  const { text } = await sdkGenerateText({
    model: anthropic('claude-3-5-sonnet-latest'),
    system,
    prompt,
    maxOutputTokens: 4000,
  });

  return text;
}
