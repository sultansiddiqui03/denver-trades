'use client';

import React, { useState } from 'react';
import WhatsAppInbox from '@/components/WhatsAppInbox';
import Button from '@/components/Button';
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
    setGeneratedDraft('');
    setDraftId('');

    try {
      const response = await fetch('/api/outreach/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: recipientName,
          product,
          channel,
          language,
          tone,
          // The streaming endpoint expects a number; coerce on the way out.
          deal_value: dealValue ? Number(dealValue) : null,
        }),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        console.error('Error generating pitch:', errorText);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';

      // Stream chunks straight into the textarea so the user sees the pitch
      // unfold in real time. The endpoint persists the final Draft via its
      // onFinish hook, so we don't need to call /api/outreach/generate after.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        setGeneratedDraft(buffered);
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
        <h1 className={styles.outreachTitle}>Outreach center</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Draft personalized multilingual WhatsApp and email offers with Claude.
        </p>
      </div>

      <div className={styles.workspaceGrid}>
        {/* Configurations Card */}
        <div className={styles.configCard}>
          <h2 className={styles.cardTitle}>Pitch builder</h2>

          {/* Recipient Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Target company</span>
            <input
              type="text"
              className={styles.inputInput}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Al-Rashid Foodstuff Trading LLC"
              aria-label="Target company name"
            />
          </div>

          {/* Product Input */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Commodity / product</span>
            <input
              type="text"
              className={styles.inputInput}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. Black Pepper 550g/l ASTA"
              aria-label="Commodity or product"
            />
          </div>

          {/* Channel Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Channel</span>
            <div className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${channel === 'WhatsApp' ? styles.toggleActive : ''}`}
                onClick={() => setChannel('WhatsApp')}
              >
                WhatsApp
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${channel === 'Email' ? styles.toggleActive : ''}`}
                onClick={() => setChannel('Email')}
              >
                Email
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
              aria-label="Tone"
            >
              <option value="professional">Professional / formal</option>
              <option value="direct">Direct / transaction-focused</option>
              <option value="casual">Friendly B2B partner</option>
            </select>
          </div>

          {/* Language Selector */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Output language</span>
            <select
              className={styles.selectInput}
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'ar' | 'es')}
              aria-label="Output language"
            >
              <option value="en">English</option>
              <option value="ar">Arabic (العربية)</option>
              <option value="es">Spanish (Español)</option>
            </select>
          </div>

          {/* Deal Value */}
          <div className={styles.formGroup}>
            <span className={styles.formLabel}>Estimated deal value (USD)</span>
            <input
              type="number"
              className={styles.inputInput}
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="150000"
              aria-label="Estimated deal value in USD"
            />
          </div>

          <Button
            variant="primary"
            loading={isGenerating}
            loadingText="Drafting…"
            disabled={!product.trim()}
            onClick={handleGenerate}
          >
            Generate pitch
          </Button>
        </div>

        {/* Output Card */}
        <div className={styles.outputCard}>
          <div className={styles.cardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Generated copy</span>
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
                  'Copy to clipboard'
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
                Fill in the fields and click Generate to draft an outreach message.
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
          WhatsApp sandbox
        </h2>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
          Read live threads and post simulated replies through the Twilio webhook.
        </p>
        <WhatsAppInbox />
      </div>
    </div>
  );
}
