import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

/**
 * Generates a 1536-dim embedding via OpenAI `text-embedding-3-small`.
 * Throws on missing key or provider failure so callers can decide what to do
 * (consistent with the Claude/Gemini error-propagation pattern from P1-8).
 *
 * Currently no caller in-tree; reserved for future pgvector semantic search
 * on `companies.embedding` (see P3 / P4 in ROADMAP.md).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  const first = response.data[0];
  if (!first) {
    throw new Error('OpenAI embeddings response was empty.');
  }
  return first.embedding;
}
