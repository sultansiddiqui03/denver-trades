import { generateText as sdkGenerateText, Output, APICallError } from 'ai';
import { google } from '@ai-sdk/google';
import type { z } from 'zod';

const apiKey = process.env.GEMINI_API_KEY;

// P2-1: migrated to Vercel AI SDK v6. The Google provider reads
// GOOGLE_GENERATIVE_AI_API_KEY from env at runtime; mirror GEMINI_API_KEY
// into it so we keep the existing env-var name in Vercel.
if (apiKey && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
}

const MODEL_ID = 'gemini-2.5-flash';

function requireApiKey(): void {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
}

/**
 * Logs the rich error surface from AI SDK v6 calls. The default `console.error`
 * on an `Error` truncates `cause` / `responseBody`, which is exactly what the
 * production search-500 log showed. Log this BEFORE re-throwing so Vercel
 * runtime logs preserve the diagnostic info.
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
    // Truncate responseBody — providers sometimes return verbose HTML on edge errors.
    base.responseBody = error.responseBody?.slice(0, 2000);
  }

  console.error('[gemini]', JSON.stringify(base));
}

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  requireApiKey();

  try {
    const { text } = await sdkGenerateText({
      model: google(MODEL_ID),
      system: systemInstruction,
      prompt,
    });
    return text;
  } catch (error) {
    logAIError('generateText', error);
    throw error;
  }
}

/**
 * Schema-based JSON generation. Pass a zod schema describing the expected
 * response shape — the SDK enforces structured output on the provider side
 * (Gemini structured output) and parses + validates the result, so callers
 * get a typed object back with no manual JSON.parse landmines.
 *
 * v6 idiom: `generateText({ output: Output.object({ schema }) })`. This
 * replaces the old `providerOptions.google.responseMimeType` approach, which
 * is not a valid field on the v3 Google provider — the actual provider option
 * surface (`GoogleGenerativeAIProviderOptions` / `GoogleLanguageModelOptions`)
 * has `responseModalities` (for media kinds) and `structuredOutputs`, but no
 * `responseMimeType`. The Output API handles wiring for us.
 */
export async function generateJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
  systemInstruction?: string,
): Promise<T> {
  requireApiKey();

  try {
    const { output } = await sdkGenerateText({
      model: google(MODEL_ID),
      system: systemInstruction,
      prompt,
      output: Output.object({ schema }),
    });
    return output;
  } catch (error) {
    logAIError('generateJSON', error);
    throw error;
  }
}

export async function generateMultimodalJSON<T>(
  prompt: string,
  files: { base64: string; mimeType: string }[],
  schema: z.ZodType<T>,
  systemInstruction?: string,
): Promise<T> {
  requireApiKey();

  const fileParts = files.map((file) => {
    const base64Data = file.base64.includes(';base64,')
      ? file.base64.split(';base64,')[1] ?? ''
      : file.base64;
    return {
      type: 'file' as const,
      data: base64Data,
      mediaType: file.mimeType,
    };
  });

  try {
    const { output } = await sdkGenerateText({
      model: google(MODEL_ID),
      system: systemInstruction,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text' as const, text: prompt },
            ...fileParts,
          ],
        },
      ],
      output: Output.object({ schema }),
    });

    return output;
  } catch (error) {
    logAIError('generateMultimodalJSON', error);
    throw error;
  }
}
