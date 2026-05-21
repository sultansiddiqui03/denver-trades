'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Check,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import Button from '@/components/Button';
import styles from './page.module.css';

// ─── Static option lists — must stay in sync with the zod enums in
// `/api/onboarding/org/route.ts`. ────────────────────────────────────────
const COMMODITY_OPTIONS = [
  'Spices',
  'Coffee',
  'Tea',
  'Cashew',
  'Pulses',
  'Grains',
  'Cardamom',
  'Pepper',
  'Saffron',
  'Cinnamon',
  'Rice',
  'Dried Fruits',
  'Nuts',
  'Other',
] as const;

const MARKET_OPTIONS = [
  'UAE',
  'Saudi Arabia',
  'India',
  'Vietnam',
  'Brazil',
  'Turkey',
  'Indonesia',
  'Germany',
  'USA',
  'UK',
  'France',
  'Singapore',
  'Japan',
  'China',
  'Other',
] as const;

type Commodity = (typeof COMMODITY_OPTIONS)[number];
type Market = (typeof MARKET_OPTIONS)[number];

export interface WizardInitialState {
  initialStep: 1 | 2 | 3;
  userName: string;
  existingOrgName: string | null;
}

interface Props {
  initial: WizardInitialState;
}

/**
 * Convert an org name into a candidate slug. Lowercase, hyphenated, ASCII
 * only. Strips leading/trailing dashes and collapses runs of dashes.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

const STEPS = [
  { num: 1, label: 'Organization', Icon: Building2 },
  { num: 2, label: 'WhatsApp', Icon: MessageCircle },
  { num: 3, label: 'Sample data', Icon: Sparkles },
] as const;

export default function OnboardingWizard({ initial }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(initial.initialStep);

  // Step 1 state
  const [orgName, setOrgName] = useState(initial.existingOrgName ?? '');
  const [slug, setSlug] = useState(
    initial.existingOrgName ? slugify(initial.existingOrgName) : ''
  );
  const [slugTouched, setSlugTouched] = useState(false);
  const [commodities, setCommodities] = useState<Set<Commodity>>(new Set());
  const [markets, setMarkets] = useState<Set<Market>>(new Set());

  // Step 2 state
  const [twilioNumber, setTwilioNumber] = useState('');

  // Global state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onOrgNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setOrgName(v);
      if (!slugTouched) {
        setSlug(slugify(v));
      }
    },
    [slugTouched]
  );

  const onSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    // Allow only the slug-safe chars while typing; everything else gets
    // converted on the fly so the user can't enter something illegal.
    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }, []);

  const toggleCommodity = useCallback((c: Commodity) => {
    setCommodities((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const toggleMarket = useCallback((m: Market) => {
    setMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }, []);

  const submitStep1 = useCallback(async () => {
    setErrorMsg(null);
    const trimmedName = orgName.trim();
    const trimmedSlug = slug.trim();

    if (trimmedName.length < 1) {
      setErrorMsg('Organization name is required.');
      return;
    }
    if (trimmedSlug.length < 2) {
      setErrorMsg('Slug must be at least 2 characters.');
      return;
    }
    if (commodities.size < 1) {
      setErrorMsg('Pick at least one commodity.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/org', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          slug: trimmedSlug,
          commodities: Array.from(commodities),
          target_markets: Array.from(markets),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Server returned ${res.status}`);
      }
      setStep(2);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save organization.');
    } finally {
      setSubmitting(false);
    }
  }, [orgName, slug, commodities, markets]);

  const submitStep2 = useCallback(
    async (opts: { skip: boolean }) => {
      setErrorMsg(null);
      setSubmitting(true);
      try {
        const res = await fetch('/api/onboarding/twilio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            twilio_whatsapp_number: opts.skip ? null : twilioNumber.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? `Server returned ${res.status}`);
        }
        setStep(3);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not save number.');
      } finally {
        setSubmitting(false);
      }
    },
    [twilioNumber]
  );

  const submitStep3 = useCallback(
    async (opts: { seed: boolean }) => {
      setErrorMsg(null);
      setSubmitting(true);
      try {
        const endpoint = opts.seed
          ? '/api/onboarding/seed'
          : '/api/onboarding/complete';
        const res = await fetch(endpoint, { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? `Server returned ${res.status}`);
        }
        // Hard navigation so the dashboard layout re-runs its gate against
        // the now-complete `users.org_id` + `organizations.onboarding_complete`.
        router.push('/dashboard');
        router.refresh();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not finish setup.');
        setSubmitting(false);
      }
    },
    [router]
  );

  const stepPct = useMemo(() => {
    return step === 1 ? 33 : step === 2 ? 66 : 100;
  }, [step]);

  return (
    <section className={styles.card}>
      <header className={styles.cardHead}>
        <p className={styles.greeting}>Hi {initial.userName.split(' ')[0]} —</p>
        <h1 className={styles.cardTitle}>Let&apos;s set up your trade desk</h1>
        <p className={styles.cardSubtitle}>
          A few quick details so Denver Trades knows what to track for you.
        </p>
      </header>

      <ol className={styles.progress} aria-label="Onboarding progress">
        {STEPS.map((s) => {
          const done = step > s.num;
          const active = step === s.num;
          const Icon = s.Icon;
          return (
            <li
              key={s.num}
              className={`${styles.progressItem} ${done ? styles.progressDone : ''} ${
                active ? styles.progressActive : ''
              }`}
            >
              <span className={styles.progressNum} aria-hidden="true">
                {done ? <Check size={14} strokeWidth={2.5} /> : <Icon size={14} strokeWidth={1.8} />}
              </span>
              <span className={styles.progressLabel}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className={styles.progressBar} aria-hidden="true">
        <div className={styles.progressBarFill} style={{ width: `${stepPct}%` }} />
      </div>

      {errorMsg && (
        <div className={styles.errorBanner} role="alert">
          {errorMsg}
        </div>
      )}

      {step === 1 && (
        <div className={styles.stepBody}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="org-name">
              Organization name
            </label>
            <input
              id="org-name"
              className={styles.input}
              type="text"
              maxLength={100}
              value={orgName}
              onChange={onOrgNameChange}
              placeholder="Sultan Trades"
              autoComplete="organization"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="org-slug">
              URL slug
              <span className={styles.labelHint}>denver-trades.app/{slug || 'your-org'}</span>
            </label>
            <input
              id="org-slug"
              className={styles.input}
              type="text"
              maxLength={100}
              value={slug}
              onChange={onSlugChange}
              placeholder="sultan-trades"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className={styles.field}>
            <p className={styles.label}>
              Commodities you trade
              <span className={styles.labelHint}>Select at least one</span>
            </p>
            <div className={styles.chipGrid}>
              {COMMODITY_OPTIONS.map((c) => {
                const selected = commodities.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
                    onClick={() => toggleCommodity(c)}
                    aria-pressed={selected}
                  >
                    {selected && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.field}>
            <p className={styles.label}>
              Target markets
              <span className={styles.labelHint}>Optional — countries you sell into or source from</span>
            </p>
            <div className={styles.chipGrid}>
              {MARKET_OPTIONS.map((m) => {
                const selected = markets.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
                    onClick={() => toggleMarket(m)}
                    aria-pressed={selected}
                  >
                    {selected && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.actions}>
            <span className={styles.actionsSpacer} />
            <Button
              variant="primary"
              onClick={submitStep1}
              loading={submitting}
              loadingText="Saving…"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.stepBody}>
          <div className={styles.stepIntro}>
            <div className={styles.stepIconWrap}>
              <MessageCircle size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h2 className={styles.stepHeading}>WhatsApp wire-up</h2>
              <p className={styles.stepSubheading}>
                Connect your Twilio WhatsApp number for inbound buyer messages.
              </p>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="twilio-number">
              Twilio number
              <span className={styles.labelHint}>
                Format: <code className={styles.code}>+14155238886</code> or{' '}
                <code className={styles.code}>whatsapp:+14155238886</code>
              </span>
            </label>
            <input
              id="twilio-number"
              className={styles.input}
              type="tel"
              maxLength={32}
              value={twilioNumber}
              onChange={(e) => setTwilioNumber(e.target.value)}
              placeholder="+14155238886"
              autoComplete="tel"
              inputMode="tel"
            />
            <p className={styles.helper}>
              This is the number buyers will message. We auto-parse RFQs into the
              Active Demand feed.
            </p>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => submitStep2({ skip: true })}
              disabled={submitting}
            >
              Skip for now
            </button>
            <Button
              variant="primary"
              onClick={() => submitStep2({ skip: false })}
              loading={submitting}
              loadingText="Saving…"
              disabled={twilioNumber.trim().length === 0}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={styles.stepBody}>
          <div className={styles.stepIntro}>
            <div className={styles.stepIconWrap}>
              <Sparkles size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h2 className={styles.stepHeading}>Make the dashboard feel alive</h2>
              <p className={styles.stepSubheading}>
                Want sample companies and a sample deal so the dashboard isn&apos;t
                empty? You can delete them anytime.
              </p>
            </div>
          </div>

          <ul className={styles.seedList}>
            <li>3 demo companies — a buyer, a seller, and a broker</li>
            <li>2 demo deals — one new lead and one in negotiation</li>
            <li>Tagged <code className={styles.code}>sample</code> for easy cleanup</li>
          </ul>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => submitStep3({ seed: false })}
              disabled={submitting}
            >
              No thanks
            </button>
            <Button
              variant="primary"
              onClick={() => submitStep3({ seed: true })}
              loading={submitting}
              loadingText="Seeding…"
            >
              Yes, seed sample data
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
