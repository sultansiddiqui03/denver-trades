import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;

function requireApiKey(): string {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return apiKey;
}

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(requireApiKey());
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text() || '';
}

export async function generateMultimodalJSON<T>(
  prompt: string,
  files: { base64: string; mimeType: string }[],
  systemInstruction?: string
): Promise<T> {
  const genAI = new GoogleGenerativeAI(requireApiKey());
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const parts = [
    prompt,
    ...files.map((file) => {
      const base64Data = file.base64.includes(';base64,')
        ? file.base64.split(';base64,')[1]
        : file.base64;
      return {
        inlineData: {
          data: base64Data,
          mimeType: file.mimeType,
        },
      };
    }),
  ];

  const result = await model.generateContent(parts);
  const response = await result.response;
  const text = response.text() || '{}';
  return JSON.parse(text) as T;
}

export async function generateJSON<T>(prompt: string, systemInstruction?: string): Promise<T> {
  const genAI = new GoogleGenerativeAI(requireApiKey());
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text() || '{}';
  return JSON.parse(text) as T;
}
