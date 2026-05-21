import { generateText as sdkGenerateText, APICallError } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const apiKey = process.env.CLAUDE_API_KEY;

// P2-1: migrated to Vercel AI SDK v6. The Anthropic provider reads
// ANTHROPIC_API_KEY from env at runtime; mirror CLAUDE_API_KEY into it so
// we keep the existing env-var name in Vercel.
if (apiKey && !process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = apiKey;
}

const MODEL_ID = 'claude-3-5-sonnet-latest';

/**
 * Logs the rich error surface from AI SDK v6 calls. Default `console.error`
 * on an Error truncates `cause`/`responseBody` — we want those on the wire.
 */
function logAIError(scope: string, error: unknown): void {
  const base: Record<string, unknown> = {
    scope,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  };

  if (error instanceof Error && error.cause) {
    base.cause =
      error.cause instanceof Error
        ? { name: error.cause.name, message: error.cause.message }
        : error.cause;
  }

  if (APICallError.isInstance(error)) {
    base.statusCode = error.statusCode;
    base.url = error.url;
    base.responseBody = error.responseBody?.slice(0, 2000);
  }

  console.error('[claude]', JSON.stringify(base));
}

export async function generateText(prompt: string, system?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is not configured.');
  }

  try {
    const { text } = await sdkGenerateText({
      model: anthropic(MODEL_ID),
      system,
      prompt,
      maxOutputTokens: 4000,
    });

    return text;
  } catch (error) {
    logAIError('generateText', error);
    throw error;
  }
}
