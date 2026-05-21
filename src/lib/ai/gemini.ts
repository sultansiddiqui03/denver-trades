import { generateText as sdkGenerateText } from 'ai';
import { google } from '@ai-sdk/google';

const apiKey = process.env.GEMINI_API_KEY;

// P2-1: migrated to Vercel AI SDK v6. The Google provider reads
// GOOGLE_GENERATIVE_AI_API_KEY from env at runtime; mirror GEMINI_API_KEY
// into it so we keep the existing env-var name in Vercel.
if (apiKey && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
}

function requireApiKey(): void {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
}

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  requireApiKey();

  const { text } = await sdkGenerateText({
    model: google('gemini-2.5-flash'),
    system: systemInstruction,
    prompt,
  });

  return text;
}

export async function generateJSON<T>(prompt: string, systemInstruction?: string): Promise<T> {
  requireApiKey();

  // NOTE: AI SDK exposes `generateObject` for structured output but it
  // requires a zod (or JSON) schema per call. Our existing callers pass an
  // ad-hoc JSON shape in the prompt and parse the response themselves, so we
  // keep that contract here by asking Gemini to emit JSON via
  // providerOptions.responseMimeType and then JSON.parse on the way out.
  // Upgrade path: introduce zod schemas at each call site and switch to
  // `generateObject` for true validated output.
  const { text } = await sdkGenerateText({
    model: google('gemini-2.5-flash'),
    system: systemInstruction,
    prompt,
    providerOptions: {
      google: {
        responseMimeType: 'application/json',
      },
    },
  });

  return JSON.parse(text || '{}') as T;
}

export async function generateMultimodalJSON<T>(
  prompt: string,
  files: { base64: string; mimeType: string }[],
  systemInstruction?: string
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

  const { text } = await sdkGenerateText({
    model: google('gemini-2.5-flash'),
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
    providerOptions: {
      google: {
        responseMimeType: 'application/json',
      },
    },
  });

  return JSON.parse(text || '{}') as T;
}
