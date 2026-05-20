'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={styles.dashboardContainer}>
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

          <div className={styles.searchPlaceholder}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="M13 13l4 4" />
            </svg>
            <span className={styles.searchText}>Search anything...</span>
          </div>

          <div className={styles.topBarActions}>
            {/* Notification Bell */}
            <button className={styles.iconBtn} aria-label="Notifications">
              <span className={styles.badgeDot}></span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

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
  );
}
