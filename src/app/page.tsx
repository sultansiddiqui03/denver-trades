'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@denvertrades.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    // Simulate login and redirect
    router.push('/dashboard');
  };

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
          <h2 className={styles.title}>Terminal Access</h2>
          <span className={styles.subtitle}>Enter credentials to access trade desk</span>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email Address</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className={styles.label}>Security Password</label>
              <a href="#" className={styles.forgotLink}>
                Forgot key?
              </a>
            </div>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.8125rem', fontWeight: 600, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 'var(--space-2)' }}>
            Establish Connection
          </button>

          <Link
            href="/dashboard"
            className="btn-secondary"
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
          >
            Bypass Access (Demo Mode)
          </Link>
        </form>

        <span className={styles.footerText}>
          Establish a new station?{' '}
          <a href="#" className={styles.signupLink}>
            Initialize Station
          </a>
        </span>
      </div>
    </div>
  );
}
