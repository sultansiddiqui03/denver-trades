'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  Copy,
  Mail,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import WhatsAppInbox from '@/components/WhatsAppInbox';
import Button from '@/components/Button';
import { useToast } from '@/components/Toast';
import styles from './page.module.css';

// Next 16 prerender step requires `useSearchParams()` to be inside a Suspense
// boundary. Wrap the body so the static shell prerenders, then the search
// params hook activates client-side on hydration.
export default function OutreachCenterPage() {
  return (
    <Suspense fallback={null}>
      <OutreachCenter />
    </Suspense>
  );
}

function OutreachCenter() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  // Two entry points land here with prefill query params:
  //   - Dossier "Generate outreach" → ?companyId=...&companyName=...
  //   - Active Demand "Generate quote →" → ?companyId=...&product=...
  // companyId is round-tripped through the URL for future use (attaching
  // the draft to a deal, hydrating extra fields from /api/companies/:id).
  const initialName =
    searchParams.get('companyName') ?? 'Al-Rashid Foodstuff Trading LLC';
  const initialProduct =
    searchParams.get('product') ?? 'Black Pepper 550g/l ASTA';
  const [recipientName, setRecipientName] = useState(initialName);
  const [product, setProduct] = useState(initialProduct);
  const [channel, setChannel] = useState<'WhatsApp' | 'Email'>('WhatsApp');
  const [language, setLanguage] = useState<'en' | 'ar' | 'es'>('en');
  const [tone, setTone] = useState('professional');
  const [dealValue, setDealValue] = useState('150000');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [draftId, setDraftId] = useState('');
  const [copied, setCopied] = useState(false);

  // Sync the recipient + product inputs when the URL changes (e.g. user
  // navigates between two dossiers or jumps from an active-demand card).
  // The project's react-hooks/set-state-in-effect rule disallows direct
  // setState inside effects — defer into a microtask the same way
  // SearchWorkspace does for its intent-filter rehydrate.
  useEffect(() => {
    const nextName = searchParams.get('companyName');
    const nextProduct = searchParams.get('product');
    if (!nextName && !nextProduct) return;
    const timer = window.setTimeout(() => {
      if (nextName) setRecipientName(nextName);
      if (nextProduct) setProduct(nextProduct);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

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
        toast('Could not generate the pitch. Please try again.', 'error');
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
      if (buffered.trim()) toast(`${channel} pitch ready for ${recipientName}.`, 'success');
    } catch (error) {
      console.error('Network error during pitch generation:', error);
      toast('Network error while generating. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedDraft);
      setCopied(true);
      toast('Copied to clipboard.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Could not copy — select and copy manually.', 'error');
    }
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
            <div className={styles.toggleRow} role="group" aria-label="Output channel">
              <button
                type="button"
                className={`${styles.toggleBtn} ${channel === 'WhatsApp' ? styles.toggleActive : ''}`}
                onClick={() => setChannel('WhatsApp')}
                aria-pressed={channel === 'WhatsApp'}
              >
                <MessageCircle size={16} strokeWidth={1.8} aria-hidden />
                WhatsApp
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${channel === 'Email' ? styles.toggleActive : ''}`}
                onClick={() => setChannel('Email')}
                aria-pressed={channel === 'Email'}
              >
                <Mail size={16} strokeWidth={1.8} aria-hidden />
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
          <div className={styles.cardTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span>Generated copy</span>
            {(generatedDraft || isGenerating) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {draftId && (
                  <span className="badge badge-yellow">
                    Saved for review
                  </span>
                )}
                {!isGenerating && generatedDraft && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={handleCopy}
                    style={{ fontSize: '0.8125rem' }}
                    aria-label="Copy generated copy to clipboard"
                  >
                    {copied ? (
                      <span className={styles.copySuccess}>
                        <Check size={14} strokeWidth={2.4} aria-hidden /> Copied
                      </span>
                    ) : (
                      <>
                        <Copy size={14} strokeWidth={1.8} aria-hidden /> Copy
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.outputBody}>
            {(generatedDraft || isGenerating) && (
              <div className={styles.outputHeader}>
                <span className={`badge ${channel === 'WhatsApp' ? 'badge-lime' : 'badge-blue'} ${styles.channelBadge}`}>
                  {channel === 'WhatsApp' ? (
                    <MessageCircle size={12} strokeWidth={2} aria-hidden />
                  ) : (
                    <Mail size={12} strokeWidth={2} aria-hidden />
                  )}
                  {channel}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Language: {language.toUpperCase()}
                </span>
              </div>
            )}

            {isGenerating && (
              <>
                <div className={styles.streamingHint} aria-live="polite">
                  <span className={styles.streamingDot} aria-hidden />
                  Claude is drafting…
                </div>
                <pre className={styles.streamingDraft} aria-busy>
                  {generatedDraft}
                  <span className={styles.streamingCursor} aria-hidden />
                </pre>
              </>
            )}

            {!isGenerating && !generatedDraft && (
              <div className={styles.outputEmpty}>
                <span className={styles.outputEmptyIcon} aria-hidden>
                  <Sparkles size={22} strokeWidth={1.6} />
                </span>
                <p style={{ margin: 0 }}>
                  Fill in the fields and click <strong>Generate pitch</strong> to draft an
                  outreach message tailored to this buyer.
                </p>
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
      <div className={styles.sandboxSection}>
        <h2 className={styles.sectionTitle}>
          WhatsApp sandbox
        </h2>
        <p className={styles.sandboxSubtitle}>
          Read live threads and post simulated replies through the Twilio webhook.
        </p>
        <WhatsAppInbox />
      </div>
    </div>
  );
}
