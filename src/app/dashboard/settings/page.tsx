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
        <h1 className={styles.settingsTitle}>Configuration & Keys</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Manage API credentials, databases, integrations, and CRM tokens.
        </p>
      </div>

      <form onSubmit={handleSave} className={styles.settingsCard}>
        {/* Supabase Config */}
        <h3 className={styles.cardSectionTitle}>Supabase Database Sync</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Supabase Project URL</label>
            <input
              type="text"
              className="input"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Supabase Anon API Key</label>
            <input
              type="password"
              className="input"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJI..."
            />
          </div>
        </div>

        {/* LLM Credentials */}
        <h3 className={styles.cardSectionTitle}>LLM Provider Settings</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Gemini Pro API Key</label>
            <input
              type="password"
              className="input"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIzaSy..."
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>OpenAI Client Secret / API Key</label>
            <input
              type="password"
              className="input"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-proj-..."
            />
          </div>
        </div>

        {/* WhatsApp CRM Integration */}
        <h3 className={styles.cardSectionTitle}>WhatsApp CRM Gateway</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>WhatsApp Business Access Token</label>
            <input
              type="password"
              className="input"
              value={whatsappToken}
              onChange={(e) => setWhatsappToken(e.target.value)}
              placeholder="EAAW..."
            />
          </div>
        </div>

        {/* Success Alert */}
        {showSavedAlert && (
          <div className={`${styles.alert} ${styles.alertSuccess}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Platform configurations saved successfully!</span>
          </div>
        )}

        {/* Actions */}
        <div className={styles.submitRow}>
          <button type="button" className="btn-secondary">
            Reset Credentials
          </button>
          <button type="submit" className="btn-primary">
            Save Configurations
          </button>
        </div>
      </form>
    </div>
  );
}
