import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Gen AI client if the key is available
const apiKey = process.env.GEMINI_API_KEY;

export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not defined. Falling back to mock response.");
    return getMockResponseForPrompt(prompt);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-2.5-flash as the fast, recommended model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text() || '';
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return getMockResponseForPrompt(prompt);
  }
}

export async function generateJSON<T>(prompt: string, systemInstruction?: string): Promise<T> {
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not defined. Falling back to mock JSON response.");
    return getMockJSONForPrompt<T>(prompt);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text() || '{}';
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("Error calling Gemini JSON API:", error);
    return getMockJSONForPrompt<T>(prompt);
  }
}

// ═══════════ MOCK RESPONSES FOR OFFLINE / TRIAL MODE ═══════════

function getMockResponseForPrompt(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("pitch") || p.includes("outreach") || p.includes("introductory email")) {
    return `Subject: Partnership Proposal - Premium Agricultural Commodity Sourcing

Dear Procurement Team,

I hope this message finds you well. I am contacting you on behalf of Denver Trades, a premium supplier of high-quality spices, grains, and specialty seeds.

We have recently analyzed trade import volume matching your procurement requirements in the Jebel Ali port and noticed a consistent requirement for premium Black Pepper 550g/l ASTA and washed oilseeds. We can supply these under CIF terms with strict ASTA quality certifications, competitive pricing, and payment terms of irrevocable L/C at sight.

Would you be open to a brief call this week to discuss custom quotes for your next shipment cycle?

Best regards,
Procurement Desk
Denver Trades`;
  }

  if (p.includes("audit") || p.includes("compliance") || p.includes("letter of credit")) {
    return `DOCUMENT COMPLIANCE AUDIT REPORT

Summary: Completed compliance comparison. 2 discrepancies identified.

1. Port Mismatch [HIGH RISK]: Letter of Credit specifies Port of Discharge as 'Jebel Ali, UAE', but Bill of Lading lists 'Sharjah, UAE'.
2. Weight Variance [WARNING]: Letter of Credit lists net weight as '32,000 KG', but Bill of Lading shows '31,850 KG' (within 0.5% tolerance but flagged for bank clearance).`;
  }

  return `Mock Gemini Response for prompt: "${prompt.slice(0, 60)}..."`;
}

function getMockJSONForPrompt<T>(prompt: string): T {
  const p = prompt.toLowerCase();
  
  // Mock Search Intent Parser
  if (p.includes("search") || p.includes("intent")) {
    return {
      keywords: ["black pepper", "spices"],
      countries: ["United Arab Emirates"],
      categories: ["Importer"],
      queryType: "semantic"
    } as unknown as T;
  }

  // Mock Document Auditor JSON output
  if (p.includes("audit") || p.includes("discrepanc")) {
    return {
      discrepancies: [
        {
          severity: "HIGH",
          category: "Port Mismatch",
          description: "Letter of Credit lists Port of Discharge as 'Jebel Ali, UAE' but Bill of Lading shows 'Port of Sharjah, UAE'."
        },
        {
          severity: "WARNING",
          category: "Date Overrun",
          description: "Latest shipment date on Letter of Credit was 2026-05-15, but Bill of Lading shows actual loading date was 2026-05-18."
        }
      ],
      summary: "Completed document audit. Mismatches detected in port of discharge and shipment timelines."
    } as unknown as T;
  }

  return {} as unknown as T;
}
