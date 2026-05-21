'use client';

import React, { useState } from 'react';
import styles from './page.module.css';

export default function SettingsPage() {
  const [supabaseUrl, setSupabaseUrl] = useState('https://oqjswkfjruiwosjdndhs.supabase.co');
  const [supabaseKey, setSupabaseKey] = useState('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon-key-here');
  const [openaiKey, setOpenaiKey] = useState('sk-proj-••••••••••••••••••••••••••••');
  const [geminiKey, setGeminiKey] = useState('AIzaSy••••••••••••••••••••••••••••');
  const [whatsappToken, setWhatsappToken] = useState('EAAW••••••••••••••••••••••••••••');
  const [showSavedAlert, setShowSavedAlert] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSavedAlert(true);
    setTimeout(() => setShowSavedAlert(false), 3000);
  };

  return (
    <div className={`${styles.settingsContainer} fade-in`}>
      {/* Header */}
      <div className={styles.settingsHeader}>
        <h1 className={styles.settingsTitle}>Settings</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Manage API credentials, databases, and integration tokens.
        </p>
      </div>

      <form onSubmit={handleSave} className={styles.settingsCard}>
        {/* Supabase Config */}
        <h3 className={styles.cardSectionTitle}>Supabase</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Project URL</label>
            <input
              type="text"
              className="input"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              aria-label="Supabase project URL"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Anon API key</label>
            <input
              type="password"
              className="input"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJI..."
              aria-label="Supabase anon API key"
            />
          </div>
        </div>

        {/* LLM Credentials */}
        <h3 className={styles.cardSectionTitle}>LLM providers</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Gemini API key</label>
            <input
              type="password"
              className="input"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
              aria-label="Gemini API key"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>OpenAI API key</label>
            <input
              type="password"
              className="input"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
              aria-label="OpenAI API key"
            />
          </div>
        </div>

        {/* WhatsApp CRM Integration */}
        <h3 className={styles.cardSectionTitle}>WhatsApp</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Business access token</label>
            <input
              type="password"
              className="input"
              value={whatsappToken}
              onChange={(e) => setWhatsappToken(e.target.value)}
              placeholder="EAAW..."
              aria-label="WhatsApp business access token"
            />
          </div>
        </div>

        {/* Success Alert */}
        {showSavedAlert && (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Settings saved</span>
          </div>
        )}

        {/* Actions */}
        <div className={styles.submitRow}>
          <button type="button" className="btn-secondary">
            Reset
          </button>
          <button type="submit" className="btn-primary">
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
