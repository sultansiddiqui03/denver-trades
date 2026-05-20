'use client';

import React, { useState } from 'react';
import WhatsAppInbox from '@/components/WhatsAppInbox';
import styles from './page.module.css';

export default function OutreachCenter() {
  const [recipientName, setRecipientName] = useState('Al-Rashid Foodstuff Trading LLC');
  const [product, setProduct] = useState('Black Pepper 550g/l ASTA');
  const [channel, setChannel] = useState<'WhatsApp' | 'Email'>('WhatsApp');
  const [language, setLanguage] = useState<'en' | 'ar' | 'es'>('en');
  const [tone, setTone] = useState('professional');
  const [dealValue, setDealValue] = useState('150000');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [draftId, setDraftId] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: recipientName,
          product,
          channel,
          language,
          tone,
          deal_value: dealValue
        })
      });

      const data = await response.json();
      if (data.success) {
        setGeneratedDraft(data.pitch);
        setDraftId(data.draft?.id || '');
      } else {
        console.error('Error generating pitch:', data.error);
      }
    } catch (error) {
      console.error('Network error during pitch generation:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`${styles.outreachContainer} fade-in`}>
      {/* Header */}
      <div className={styles.outreachHeader}>
        <h1 className={styles.outreachTitle}>AI Outreach Center</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Compose personalized multilingual WhatsApp and email offers powered by Claude 3.5 Sonnet.
        </p>
      </div>

      <div className={styles.workspaceGrid}>
        {/* Configurations Card */}
        <div className={styles.configCard}>
          <h2 className={styles.cardTitle}>Outreach Pitch Builder</h2>

          {/* Recipient Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Target Company Name</span>
            <input
              type="text"
              className={styles.inputInput}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Al-Rashid Foodstuff Trading LLC"
            />
          </div>

          {/* Product Input */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Commodity / Product Details</span>
            <input
              type="text"
              className={styles.inputInput}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. Black Pepper 550g/l ASTA"
            />
          </div>

          {/* Channel Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Communication Channel</span>
            <div className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${channel === 'WhatsApp' ? styles.toggleActive : ''}`}
                onClick={() => setChannel('WhatsApp')}
              >
                WhatsApp Message
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${channel === 'Email' ? styles.toggleActive : ''}`}
                onClick={() => setChannel('Email')}
              >
                Email Template
              </button>
            </div>
          </div>

          {/* Tone Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Tone</span>
            <select
              className={styles.selectInput}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="professional">Professional / formal</option>
              <option value="direct">Direct / transaction-focused</option>
              <option value="casual">Friendly B2B partner</option>
            </select>
          </div>

          {/* Language Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Output Language</span>
            <select
              className={styles.selectInput}
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'ar' | 'es')}
            >
              <option value="en">English</option>
              <option value="ar">Arabic (العربية)</option>
              <option value="es">Spanish (Español)</option>
            </select>
          </div>

          {/* Deal Value */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Estimated Deal Value (USD)</span>
            <input
              type="number"
              className={styles.inputInput}
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="150000"
            />
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={handleGenerate}
            disabled={isGenerating || !product.trim()}
          >
            {isGenerating ? 'Drafting with Claude...' : 'Generate Pitch Copy'}
          </button>
        </div>

        {/* Output Card */}
        <div className={styles.outputCard}>
          <div className={styles.cardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Generated Copy</span>
            {generatedDraft && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {draftId && (
                  <span className="badge badge-yellow">
                    Saved for review
                  </span>
                )}
                <button type="button" className="btn-ghost" onClick={handleCopy} style={{ fontSize: '0.8125rem' }}>
                {copied ? (
                  <span className={styles.copySuccess}>
                    ✓ Copied
                  </span>
                ) : (
                  'Copy to Clipboard'
                )}
                </button>
              </div>
            )}
          </div>

          <div className={styles.outputBody}>
            {isGenerating ? (
              <div className="skeleton" style={{ flex: 1, borderRadius: 'var(--radius-md)' }}></div>
            ) : generatedDraft ? (
              <div className={styles.outputHeader}>
                <span className={`badge ${channel === 'WhatsApp' ? 'badge-lime' : 'badge-blue'} ${styles.channelBadge}`}>
                  {channel}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Language: {language.toUpperCase()}
                </span>
              </div>
            ) : null}

            {!isGenerating && !generatedDraft && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Adjust the configurations and click Generate to build trade outreach templates.
              </div>
            )}

            {!isGenerating && generatedDraft && (
              <pre className={`${styles.draftContent} ${channel === 'WhatsApp' ? styles.whatsappMock : styles.emailMock}`}>
                {generatedDraft}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* WhatsApp Thread Inbox underneath */}
      <div style={{ marginTop: '40px' }}>
        <h2 className={styles.sectionTitle} style={{ marginBottom: '15px' }}>
          Interactive Live WhatsApp Sandbox
        </h2>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
          View ongoing trade chat streams and simulate real-time replies through the Twilio webhook handler.
        </p>
        <WhatsAppInbox />
      </div>
    </div>
  );
}
