import { signInWithGoogle } from '@/app/auth/actions';
import {
  BarChart3,
  Bot,
  ChevronRight,
  Globe2,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import styles from './page.module.css';

interface LoginPageProps {
  searchParams?: Promise<{
    next?: string;
    error?: string;
  }>;
}

export default async function LandingPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params?.next?.startsWith('/') ? params.next : '/dashboard';
  const error = params?.error;

  return (
    <div className={`${styles.root} dot-grid`}>
      {/* ── Ambient glows ── */}
      <div className={styles.glowTopLeft} aria-hidden="true" />
      <div className={styles.glowBottomRight} aria-hidden="true" />

      {/* ══════════════════════ NAV ══════════════════════ */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logoRow}>
            <div className={styles.logoIcon}>D</div>
            <span className={styles.logoText}>
              <span className={styles.logoAccent}>Denver</span>
              <span className={styles.logoWhite}>Trades</span>
            </span>
          </div>

          <form action={signInWithGoogle} className={styles.navCta}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" className="btn-primary">
              Sign in
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </form>
        </div>
      </header>

      {/* ══════════════════════ HERO ══════════════════════ */}
      <section className={`${styles.hero} slide-up`}>
        <div className={styles.heroBadge}>
          <Zap size={12} strokeWidth={2} style={{ color: 'var(--accent-lime)' }} />
          <span>Customs intelligence for spice &amp; agri exporters</span>
        </div>

        <h1 className={styles.heroHeadline}>
          Stop guessing who buys.{' '}
          <span className={styles.heroAccent}>Know who imports.</span>
        </h1>

        <p className={styles.heroSubhead}>
          Denver Trades surfaces buyers who provably import what you sell — using
          live shipment data — then scores each lead and drafts your first outreach.
          No cold lists. No guesswork.
        </p>

        <div className={styles.heroActions}>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            {error && (
              <p className={styles.errorMsg}>{decodeURIComponent(error)}</p>
            )}
            <button type="submit" className={`btn-primary ${styles.heroCta}`}>
              <span className={styles.googleMark}>G</span>
              Get started with Google
            </button>
          </form>
          <span className={styles.heroHint}>Free to try · No credit card required</span>
        </div>

        {/* Stat strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>10 000+</span>
            <span className={styles.statLabel}>Importers tracked</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>0–100</span>
            <span className={styles.statLabel}>AI buyer-fit score</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>Real-time</span>
            <span className={styles.statLabel}>WhatsApp demand capture</span>
          </div>
        </div>
      </section>

      {/* ══════════════════════ 3-PILLAR FEATURES ══════════════════════ */}
      <section className={styles.features}>
        <div className={styles.sectionLabel}>Core pillars</div>
        <h2 className={styles.sectionTitle}>
          Every edge you need to close trade deals faster
        </h2>

        <div className={styles.pillarsGrid}>
          {/* Pillar 1 */}
          <div className={`${styles.pillarCard} glass gradient-border`}>
            <div className={styles.pillarIcon}>
              <Search size={22} strokeWidth={1.6} />
            </div>
            <h3 className={styles.pillarTitle}>Customs Intelligence</h3>
            <p className={styles.pillarDesc}>
              Pull real shipment history, HS codes, port data and supplier networks
              for any importer worldwide — not estimated intent, actual trade records.
            </p>
            <ul className={styles.pillarList}>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Verified import volumes per commodity</li>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Source countries &amp; freight routes</li>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Top suppliers they already buy from</li>
            </ul>
          </div>

          {/* Pillar 2 */}
          <div className={`${styles.pillarCard} glass gradient-border`}>
            <div className={`${styles.pillarIcon} ${styles.pillarIconLime}`}>
              <Bot size={22} strokeWidth={1.6} />
            </div>
            <h3 className={styles.pillarTitle}>AI Buyer-Fit Scoring</h3>
            <p className={styles.pillarDesc}>
              Every company in your pipeline receives a 0–100 fit score computed
              from commodity match, import frequency, volume band and trade lane
              alignment — so you work the best leads first.
            </p>
            <ul className={styles.pillarList}>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Enriched automatically on import</li>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Scores update as new data arrives</li>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> One-click outreach from top matches</li>
            </ul>
          </div>

          {/* Pillar 3 */}
          <div className={`${styles.pillarCard} glass gradient-border`}>
            <div className={`${styles.pillarIcon} ${styles.pillarIconGreen}`}>
              <MessageSquare size={22} strokeWidth={1.6} />
            </div>
            <h3 className={styles.pillarTitle}>Active Demand Feed</h3>
            <p className={styles.pillarDesc}>
              Inbound WhatsApp RFQs are parsed by Gemini and surfaced as structured
              demand cards — product, quantity, incoterm, port, deadline — with a
              one-tap &ldquo;Generate quote&rdquo; action.
            </p>
            <ul className={styles.pillarList}>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Auto-parsed from your WhatsApp inbox</li>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> No manual CRM data entry needed</li>
              <li><ShieldCheck size={14} strokeWidth={1.8} /> Quote draft in your buyer&apos;s language</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ══════════════════════ HOW IT WORKS ══════════════════════ */}
      <section className={styles.howItWorks}>
        <div className={styles.sectionLabel}>How it works</div>
        <h2 className={styles.sectionTitle}>From prospect to quote in minutes</h2>

        <div className={styles.stepsRow}>
          <div className={styles.step}>
            <div className={styles.stepNum}>01</div>
            <div className={styles.stepIcon}><Globe2 size={20} strokeWidth={1.6} /></div>
            <h4 className={styles.stepTitle}>Scrape &amp; enrich</h4>
            <p className={styles.stepDesc}>
              Run an AI agent to find importers for your commodity. Each result is
              enriched with shipment records and a fit score in seconds.
            </p>
          </div>
          <div className={styles.stepConnector} aria-hidden="true" />
          <div className={styles.step}>
            <div className={styles.stepNum}>02</div>
            <div className={styles.stepIcon}><BarChart3 size={20} strokeWidth={1.6} /></div>
            <h4 className={styles.stepTitle}>Score &amp; prioritise</h4>
            <p className={styles.stepDesc}>
              The pipeline shows every deal with a fit score, shipment volume and
              HS-code match so you instantly know where to focus.
            </p>
          </div>
          <div className={styles.stepConnector} aria-hidden="true" />
          <div className={styles.step}>
            <div className={styles.stepNum}>03</div>
            <div className={styles.stepIcon}><Sparkles size={20} strokeWidth={1.6} /></div>
            <h4 className={styles.stepTitle}>Draft &amp; send</h4>
            <p className={styles.stepDesc}>
              Generate a personalised email or WhatsApp opener referencing the
              buyer&apos;s actual import history. One click, ready to review.
            </p>
          </div>
          <div className={styles.stepConnector} aria-hidden="true" />
          <div className={styles.step}>
            <div className={styles.stepNum}>04</div>
            <div className={styles.stepIcon}><TrendingUp size={20} strokeWidth={1.6} /></div>
            <h4 className={styles.stepTitle}>Track &amp; close</h4>
            <p className={styles.stepDesc}>
              Move deals through 9 trade-specific stages from New Lead to Shipped,
              with document audit built in for B/L vs L/C compliance.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════ CTA BANNER ══════════════════════ */}
      <section className={styles.ctaBanner}>
        <div className={`${styles.ctaCard} gradient-border`}>
          <h2 className={styles.ctaTitle}>
            Ready to find buyers who actually import your product?
          </h2>
          <p className={styles.ctaSubtext}>
            Sign in and run your first lead search in under two minutes.
          </p>
          <form action={signInWithGoogle} className={styles.ctaForm}>
            <input type="hidden" name="next" value={next} />
            <button type="submit" className={`btn-primary ${styles.ctaBtn}`}>
              <span className={styles.googleMark}>G</span>
              Continue with Google
            </button>
          </form>
        </div>
      </section>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.logoRow}>
            <div className={styles.logoIconSm}>D</div>
            <span className={styles.logoText}>
              <span className={styles.logoAccent}>Denver</span>
              <span className={styles.logoWhite}>Trades</span>
            </span>
          </div>
          <p className={styles.footerTagline}>
            Trade intelligence for the modern exporter.
          </p>
          <p className={styles.footerCopy}>
            &copy; {new Date().getFullYear()} Denver Trades. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
