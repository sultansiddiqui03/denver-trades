'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Menu, Search } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import CommandPalette from '@/components/CommandPalette';
import ProgressBar from '@/components/ProgressBar';
import NotificationCenter from '@/components/NotificationCenter';
import TopBarUser from '@/components/TopBarUser';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);

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

        {mobileOpen && (
          <div
            className={styles.sidebarOverlay}
            onClick={() => setMobileOpen(false)}
            role="presentation"
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
          <header className={styles.topBar}>
            <button
              className={styles.hamburgerBtn}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation menu"
            >
              <Menu size={22} strokeWidth={1.8} />
            </button>

            <button
              className={styles.searchPlaceholder}
              onClick={() => setCmdkOpen(true)}
              type="button"
              aria-label="Open command palette"
            >
              <Search size={18} strokeWidth={1.6} />
              <span className={styles.searchText}>Search anything…</span>
              <kbd className={styles.searchKbd}>⌘K</kbd>
            </button>

            <div className={styles.topBarActions}>
              <NotificationCenter />
              <TopBarUser />
            </div>
          </header>

          <div className={`${styles.pageBody} dot-grid`}>{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}
