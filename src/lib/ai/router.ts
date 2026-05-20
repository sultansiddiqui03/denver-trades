import * as gemini from './gemini';
import * as claude from './claude';

export type AIProvider = 'gemini' | 'claude';

export interface GenerateTextOptions {
  provider?: AIProvider;
  systemPrompt?: string;
  fallbackProvider?: AIProvider;
}

/**
 * Unified generation router with automatic fallback logic.
 */
export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {}
): Promise<string> {
  const provider = options.provider || 'claude'; // default to Claude for reasoning/writing
  const fallback = options.fallbackProvider || (provider === 'claude' ? 'gemini' : 'claude');

  try {
    if (provider === 'claude') {
      return await claude.generateText(prompt, options.systemPrompt);
    } else {
      return await gemini.generateText(prompt, options.systemPrompt);
    }
  } catch (error) {
    console.error(`AI Router: Primary provider ${provider} failed. Routing to ${fallback}. Error:`, error);
    if (fallback === 'claude') {
      return await claude.generateText(prompt, options.systemPrompt);
    } else {
      return await gemini.generateText(prompt, options.systemPrompt);
    }
  }
}
