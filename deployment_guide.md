# Denver-Trades — Production Deployment & Handover Guide

This guide details how to take the completed **Denver-Trades** application from local development to production on **Vercel** and **Supabase**, including configuring live **Twilio WhatsApp** webhooks and background price crons.

---

## 1. Supabase Database Configuration

Since you already have a **Supabase Pro** account and project setup, ensure the following tables are present. If you need to seed or initialize them, run the SQL files in your Supabase SQL Editor:

1.  **`companies`**: For AI semantic lead searches.
2.  **`outreach_threads`**: Logs WhatsApp messages.
3.  **`document_audits`**: Keeps L/C compliance audit histories.
4.  **`commodity_prices`**: Holds historical benchmark price rates.

Ensure your **Row Level Security (RLS)** is configured to authorize reading and writing by your web application service account.

---

## 2. Vercel Deployment Checklist

Follow these steps to deploy the application on Vercel:

1.  **Import Repo**: Connect your GitHub repository to Vercel.
2.  **Environment Variables**: In the Vercel project settings, configure the following keys exactly:
    
    | Environment Variable Name | Description / Value |
    | :--- | :--- |
    | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
    | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Client Anonymous Key |
    | `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (secure backend bypass) |
    | `GEMINI_API_KEY` | Google AI Studio Key (for AI Search & Document Audits) |
    | `CLAUDE_API_KEY` | Anthropic Console Key (for Outreach Pitch Generator) |
    | `OPENAI_API_KEY` | OpenAI API Key (for semantic vector calculations) |
    
3.  **Deploy**: Click **Deploy**. Vercel will build the Next.js routes and compile page assets.

---

## 3. Live Twilio WhatsApp Integration

To receive messages from customers on WhatsApp in real time, set up Twilio:

1.  **Create Twilio Account**: Sign up at [Twilio](https://www.twilio.com) and navigate to the **Twilio Console**.
2.  **Get Credentials**: Retrieve your:
    *   **Account SID**
    *   **Auth Token**
    *   **WhatsApp Sandbox Number** (usually `+1 415 523 8886`)
3.  **Set Up Sandbox Webhook**:
    *   Go to **Messaging > Try it Out > Send a WhatsApp Message**.
    *   Under **Sandbox Settings**, locate the **"When a message comes in"** webhook input field.
    *   Paste your live Vercel endpoint: `https://<your-vercel-domain>.vercel.app/api/webhooks/whatsapp`.
    *   Ensure the HTTP request method is set to **POST**.
    *   Click **Save**.
4.  **How to Test**:
    *   Send the join code (e.g. `join <sandbox-keyword>`) to your Twilio Sandbox WhatsApp number from your phone.
    *   Send any normal message (e.g., `"Need CIF Jebel Ali quote for black pepper"`).
    *   Check your live Vercel logs or the Denver-Trades active threads dashboard — you will see the incoming WhatsApp message appear instantly!

---

## 4. Vercel Daily Cron Jobs

The application includes a `vercel.json` file configuring background price volatility ingestion.

*   **Endpoint**: `/api/prices?cron=true`
*   **Trigger Interval**: Once daily at 2:00 AM.
*   **Manual Trigger**: To test background cron ticks in production, make a `GET` call using curl or Postman:
    ```bash
    curl -X GET "https://<your-vercel-domain>.vercel.app/api/prices?cron=true"
    ```
    This triggers a tick updating market indices with simulated volatility.
