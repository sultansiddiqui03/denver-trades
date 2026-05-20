import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.CLAUDE_API_KEY;

export async function generateText(prompt: string, system?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY is not configured.');
  }

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (block && block.type === 'text') {
    return block.text;
  }
  return '';
}
