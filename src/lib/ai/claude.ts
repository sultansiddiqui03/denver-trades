import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.CLAUDE_API_KEY;

export async function generateText(prompt: string, system?: string): Promise<string> {
  if (!apiKey) {
    console.warn("CLAUDE_API_KEY is not defined. Falling back to mock response.");
    return getMockResponseForPrompt(prompt);
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = response.content[0];
    if (block.type === 'text') {
      return block.text;
    }
    return '';
  } catch (error) {
    console.error("Error calling Claude API:", error);
    return getMockResponseForPrompt(prompt);
  }
}

// ═══════════ MOCK RESPONSES FOR OFFLINE / TRIAL MODE ═══════════

function getMockResponseForPrompt(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("whatsapp") || p.includes("pitch") || p.includes("email")) {
    return `Subject: Procurement Collaboration Setup - Denver Trades

Hi Youssef,

I noticed Al-Rashid Foodstuff regularly unloads shipment cargo of Black Pepper at Jebel Ali. We operate local packing lines matching standard ASTA specs.

We can support you with custom packaging sizes, direct supplier inspections, and payment terms of CAD/L/C at sight.

Would you be open to coordinating a trial shipment of 15MT Black Pepper 550 ASTA?

Let me know.

Regards,
Denver Trades Team`;
  }

  return `Mock Claude Response for prompt: "${prompt.slice(0, 60)}..."`;
}
