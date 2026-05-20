import { signInWithGoogle } from '@/app/auth/actions';
import styles from './page.module.css';

interface LoginPageProps {
  searchParams?: Promise<{
    next?: string;
    error?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params?.next?.startsWith('/') ? params.next : '/dashboard';
  const error = params?.error;

  return (
    <div className={`${styles.authContainer} dot-grid`}>
      <div className={`${styles.authCard} scale-in`}>
        {/* Logo */}
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}>D</div>
          <span className={styles.logoText}>
            <span className={styles.logoAccent}>Denver</span>
            <span className={styles.logoWhite}>Trades</span>
          </span>
        </div>

        {/* Header */}
        <div className={styles.headerText}>
          <h2 className={styles.title}>Trade Desk Access</h2>
          <span className={styles.subtitle}>Sign in with Google to continue</span>
        </div>

        {/* Form */}
        <form action={signInWithGoogle} className={styles.form}>
          <input type="hidden" name="next" value={next} />
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.8125rem', fontWeight: 600, textAlign: 'center' }}>
              {decodeURIComponent(error)}
            </div>
          )}

          <button type="submit" className={`${styles.oauthButton} btn-primary`}>
            <span className={styles.googleMark}>G</span>
            Continue with Google
          </button>
        </form>

        <span className={styles.footerText}>
          Access is scoped to your Supabase organization profile.
        </span>
      </div>
    </div>
  );
}
