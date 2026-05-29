import React from 'react';
import { redirect } from 'next/navigation';
import { CheckCircle2, Database, Info, KeyRound, MessageSquare, Mail, Search, Shield, Sparkles, XCircle } from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const has = (k: string): boolean => Boolean(process.env[k] && process.env[k]!.trim());
const hasAny = (...ks: string[]): boolean => ks.some(has);

interface Integration {
  title: string;
  icon: typeof KeyRound;
  /** What this integration powers in the app. */
  powers: string;
  /** Connected when all required envs are present. */
  connected: boolean;
  /** Per-variable presence (no values — booleans only). */
  vars: { name: string; present: boolean; optional?: boolean }[];
}

export default async function SettingsPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;
  const { data: org } = await supabase
    .from('organizations')
    .select('name, slug, commodities, target_markets')
    .eq('id', orgId)
    .maybeSingle();

  const integrations: Integration[] = [
    {
      title: 'Supabase — database & auth',
      icon: Database,
      powers: 'Stores companies, deals, shipments, and signs users in.',
      connected: has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY') && has('SUPABASE_SERVICE_ROLE_KEY'),
      vars: [
        { name: 'NEXT_PUBLIC_SUPABASE_URL', present: has('NEXT_PUBLIC_SUPABASE_URL') },
        { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', present: has('NEXT_PUBLIC_SUPABASE_ANON_KEY') },
        { name: 'SUPABASE_SERVICE_ROLE_KEY', present: has('SUPABASE_SERVICE_ROLE_KEY') },
      ],
    },
    {
      title: 'Claude — outreach & enrichment',
      icon: Sparkles,
      powers: 'Drafts grounded outreach and classifies/enriches companies.',
      connected: hasAny('CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'),
      vars: [{ name: 'CLAUDE_API_KEY', present: hasAny('CLAUDE_API_KEY', 'ANTHROPIC_API_KEY') }],
    },
    {
      title: 'Gemini — extraction',
      icon: Sparkles,
      powers: 'Structured demand extraction and JSON enrichment.',
      connected: hasAny('GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'),
      vars: [{ name: 'GEMINI_API_KEY', present: hasAny('GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY') }],
    },
    {
      title: 'Apify — customs scraping',
      icon: Search,
      powers: 'Buyer discovery, customs enrichment, and market intelligence.',
      connected: hasAny('APIFY_TOKEN', 'APIFY_API_TOKEN'),
      vars: [
        { name: 'APIFY_TOKEN', present: hasAny('APIFY_TOKEN', 'APIFY_API_TOKEN') },
        { name: 'APIFY_WEBHOOK_SECRET', present: has('APIFY_WEBHOOK_SECRET'), optional: true },
      ],
    },
    {
      title: 'Twilio — WhatsApp',
      icon: MessageSquare,
      powers: 'Inbound buyer messages → demand signals, and outbound replies.',
      connected: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_WHATSAPP_NUMBER'),
      vars: [
        { name: 'TWILIO_ACCOUNT_SID', present: has('TWILIO_ACCOUNT_SID') },
        { name: 'TWILIO_AUTH_TOKEN', present: has('TWILIO_AUTH_TOKEN') },
        { name: 'TWILIO_WHATSAPP_NUMBER', present: has('TWILIO_WHATSAPP_NUMBER') },
      ],
    },
    {
      title: 'Resend — email outreach',
      icon: Mail,
      powers: 'Sends outreach emails (simulation mode without it).',
      connected: has('RESEND_API_KEY') && has('RESEND_FROM_EMAIL'),
      vars: [
        { name: 'RESEND_API_KEY', present: has('RESEND_API_KEY') },
        { name: 'RESEND_FROM_EMAIL', present: has('RESEND_FROM_EMAIL') },
      ],
    },
    {
      title: 'Semantic search (OpenAI embeddings)',
      icon: Search,
      powers: 'Optional — powers vector search over companies.',
      connected: has('OPENAI_API_KEY'),
      vars: [{ name: 'OPENAI_API_KEY', present: has('OPENAI_API_KEY'), optional: true }],
    },
    {
      title: 'Automation security',
      icon: Shield,
      powers: 'Authenticates cron jobs and admin/automation endpoints.',
      connected: has('CRON_SECRET'),
      vars: [{ name: 'CRON_SECRET', present: has('CRON_SECRET') }],
    },
  ];

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <div className={`${styles.settingsContainer} fade-in`}>
      <div className={styles.settingsHeader}>
        <h1 className={styles.settingsTitle}>Settings</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          {org?.name ? `${org.name} · ` : ''}
          {connectedCount} of {integrations.length} integrations connected.
        </p>
      </div>

      <div className={styles.infoBanner} role="note">
        <Info size={18} strokeWidth={1.8} aria-hidden className={styles.infoBannerIcon} />
        <div>
          <p className={styles.infoBannerTitle}>Live integration status</p>
          <p className={styles.infoBannerDesc}>
            This reflects which environment variables are actually configured on the server (presence
            only — secret values are never read into the browser). To add or rotate a key, update the
            variable in your Vercel project and redeploy.
          </p>
        </div>
      </div>

      <div className={styles.statusGrid}>
        {integrations.map((it) => {
          const Icon = it.icon;
          return (
            <section key={it.title} className={`${styles.statusCard} lift`}>
              <div className={styles.statusCardTop}>
                <span className={styles.statusCardTitle}>
                  <Icon size={16} strokeWidth={1.8} aria-hidden />
                  {it.title}
                </span>
                <span
                  className={`${styles.statusPill} ${it.connected ? styles.statusOn : styles.statusOff}`}
                >
                  {it.connected ? (
                    <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden />
                  ) : (
                    <XCircle size={13} strokeWidth={2.2} aria-hidden />
                  )}
                  {it.connected ? 'Connected' : 'Not configured'}
                </span>
              </div>
              <p className={styles.statusPowers}>{it.powers}</p>
              <div className={styles.statusVars}>
                {it.vars.map((v) => (
                  <span
                    key={v.name}
                    className={`${styles.varChip} ${v.present ? styles.varOn : styles.varOff}`}
                    title={v.present ? 'Configured' : v.optional ? 'Optional — not set' : 'Missing'}
                  >
                    <span className={styles.varDot} aria-hidden />
                    <code>{v.name}</code>
                    {v.optional && !v.present ? <span className={styles.varOpt}>optional</span> : null}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
