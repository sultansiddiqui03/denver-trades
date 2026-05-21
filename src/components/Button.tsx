'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  /**
   * When true, renders a spinner in place of the leading content and disables
   * the button. Independent of `disabled` — both will block clicks, but
   * `loading` also shows the spinner.
   */
  loading?: boolean;
  /**
   * Optional loading label shown next to the spinner. Defaults to the
   * children, so existing call sites with active-form labels just work
   * (e.g. children="Generating…" pre-set when loading).
   */
  loadingText?: React.ReactNode;
  /** Defaults to "button" so this never accidentally submits a form. */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Shared button primitive. Replaces the ad-hoc
 *   <button className="btn-primary" disabled={isLoading}>
 *     {isLoading ? 'Saving…' : 'Save'}
 *   </button>
 * pattern that was duplicated across ~7 call sites.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    loading = false,
    loadingText,
    disabled,
    children,
    className,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  const variantClass = styles[variant] ?? styles.primary;
  const cls = [styles.btn, variantClass, loading ? styles.loading : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <Loader2 size={16} strokeWidth={1.8} className={styles.spinner} aria-hidden="true" />
      )}
      <span className={styles.label}>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
});

export default Button;
