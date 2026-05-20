'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './NotificationCenter.module.css';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  color: string;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const DOT_CLASS: Record<string, string> = {
  lime: 'dotLime', green: 'dotGreen', blue: 'dotBlue', purple: 'dotPurple', yellow: 'dotYellow',
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/activity');
      const data = await res.json();
      if (data.success) {
        setItems(data.activities || []);
        setUnread(prev => prev === 0 && data.activities.length > 0 ? data.activities.length : prev);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const fetchTimer = window.setTimeout(() => {
      void fetchNotifications();
    }, 0);
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      window.clearTimeout(fetchTimer);
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    setOpen(prev => !prev);
    if (!open) setUnread(0);
  };

  return (
    <div className={styles.container} ref={ref}>
      <button className={styles.bellBtn} onClick={handleToggle} aria-label="Notifications">
        {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h4 className={styles.dropdownTitle}>Notifications</h4>
            <button className={styles.markReadBtn} onClick={() => setUnread(0)}>
              Mark all read
            </button>
          </div>

          <div className={styles.dropdownBody}>
            {items.length === 0 ? (
              <div className={styles.emptyNotif}>No notifications yet</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className={styles.notifItem}>
                  <div className={`${styles.notifDot} ${styles[DOT_CLASS[item.color] || 'dotGreen']}`} />
                  <div className={styles.notifContent}>
                    <span className={styles.notifTitle}>{item.title}</span>
                    <span className={styles.notifDesc}>{item.description}</span>
                    <span className={styles.notifTime}>{timeAgo(item.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
