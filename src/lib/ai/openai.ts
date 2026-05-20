import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!apiKey) {
    console.warn("OPENAI_API_KEY is not defined. Returning mock embedding.");
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating OpenAI embedding:", error);
    // Return a mock embedding in case of error
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }
}
