'use client';

import React from 'react';
import { Info, KeyRound, Lock, Shield } from 'lucide-react';
import styles from './page.module.css';

// Masked previews so curious users see what shape the key takes, but nothing
// secret leaks — these are non-editable, illustrative-only.
const PREVIEWS = {
  supabaseUrl: 'https://edahefbttohwmdokptoc.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.••••••••••••••••',
  geminiKey: 'AIzaSy••••••••••••••••••••••••••••',
  claudeKey: 'sk-ant-api03-••••••••••••••••••••••••••••',
  twilioToken: '••••••••••••••••••••••••••••••••',
} as const;

interface Section {
  title: string;
  icon: typeof KeyRound;
  rows: Array<{ label: string; value: string; envVar: string }>;
}

const SECTIONS: Section[] = [
  {
    title: 'Supabase',
    icon: Shield,
    rows: [
      {
        label: 'Project URL',
        value: PREVIEWS.supabaseUrl,
        envVar: 'NEXT_PUBLIC_SUPABASE_URL',
      },
      {
        label: 'Anon API key',
        value: PREVIEWS.supabaseKey,
        envVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      },
    ],
  },
  {
    title: 'LLM providers',
    icon: KeyRound,
    rows: [
      { label: 'Gemini API key', value: PREVIEWS.geminiKey, envVar: 'GEMINI_API_KEY' },
      { label: 'Claude API key', value: PREVIEWS.claudeKey, envVar: 'CLAUDE_API_KEY' },
    ],
  },
  {
    title: 'WhatsApp (Twilio)',
    icon: Lock,
    rows: [
      {
        label: 'Auth token',
        value: PREVIEWS.twilioToken,
        envVar: 'TWILIO_AUTH_TOKEN',
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className={`${styles.settingsContainer} fade-in`}>
      {/* Header */}
      <div className={styles.settingsHeader}>
        <h1 className={styles.settingsTitle}>Settings</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Credentials and integration overview for your Denver Trades workspace.
        </p>
      </div>

      <div className={styles.infoBanner} role="note">
        <Info size={18} strokeWidth={1.8} aria-hidden className={styles.infoBannerIcon} />
        <div>
          <p className={styles.infoBannerTitle}>Production credentials are managed via Vercel</p>
          <p className={styles.infoBannerDesc}>
            This page is a read-only overview of which integrations are wired up. To rotate or
            add keys, update the corresponding environment variable in your Vercel project and
            redeploy. We never store secrets in the browser.
          </p>
        </div>
      </div>

      <div className={styles.settingsCard}>
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <section key={section.title} className={styles.section}>
              <h3 className={styles.cardSectionTitle}>
                <Icon size={16} strokeWidth={1.8} aria-hidden />
                {section.title}
              </h3>
              <div className={styles.formGrid}>
                {section.rows.map((row) => (
                  <div key={row.envVar} className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor={`field-${row.envVar}`}>
                      {row.label}
                      <code className={styles.envBadge}>{row.envVar}</code>
                    </label>
                    <input
                      id={`field-${row.envVar}`}
                      type="text"
                      className={styles.readOnlyInput}
                      value={row.value}
                      readOnly
                      aria-label={`${row.label} (read-only preview)`}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
