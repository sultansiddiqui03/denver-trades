'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import CommandPalette from '@/components/CommandPalette';
import ProgressBar from '@/components/ProgressBar';
import NotificationCenter from '@/components/NotificationCenter';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdkOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ToastProvider>
    <div className={styles.dashboardContainer}>
      <ProgressBar />
      <CommandPalette isOpen={cmdkOpen} onClose={() => setCmdkOpen(false)} />

      {/* Sidebar Overlay for Mobile */}
      {mobileOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div
        className={`${styles.mainContent} ${
          collapsed ? styles.contentCollapsed : styles.contentExpanded
        }`}
      >
        {/* TopBar Header */}
        <header className={styles.topBar}>
          {/* Hamburger Menu (Mobile Only) */}
          <button
            className={styles.hamburgerBtn}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle Navigation Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>

          {/* Cmd+K Search Trigger */}
          <button
            className={styles.searchPlaceholder}
            onClick={() => setCmdkOpen(true)}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="M13 13l4 4" />
            </svg>
            <span className={styles.searchText}>Search anything...</span>
            <kbd className={styles.searchKbd}>⌘K</kbd>
          </button>

          <div className={styles.topBarActions}>
            {/* Notification Center */}
            <NotificationCenter />

            {/* Profile Avatar */}
            <div className={styles.profileSummary}>
              <div className={styles.avatar}>ST</div>
              <div className={styles.profileText}>
                <span className={styles.profileName}>Sultan Trades</span>
                <span className={styles.profileRole}>Owner</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content container */}
        <div className={`${styles.pageBody} dot-grid`}>{children}</div>
      </div>
    </div>
    </ToastProvider>
  );
}
