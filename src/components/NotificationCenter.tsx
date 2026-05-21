'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './NotificationCenter.module.css';

const SEEN_STORAGE_KEY = 'denver:notif-last-seen';

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
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/activity');
      const data = await res.json();
      if (data.success) {
        const activities = data.activities || [];
        setItems(activities);
        // Compare timestamps against the "last seen" mark in localStorage.
        // Anything newer than that mark counts as unread.
        const lastSeen =
          typeof window !== 'undefined'
            ? Number(window.localStorage.getItem(SEEN_STORAGE_KEY) || 0)
            : 0;
        const count = activities.filter((a: NotificationItem) => {
          const ts = new Date(a.timestamp).getTime();
          return Number.isFinite(ts) && ts > lastSeen;
        }).length;
        setUnread(count);
      }
    } catch {
      /* silent */
    } finally {
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    const fetchTimer = window.setTimeout(() => {
      void fetchNotifications();
    }, 0);

    // Realtime: refresh when a new notification lands; falls back to 60s poll
    // so we still surface activity-feed items that don't trigger a notification row.
    const channel = supabase
      .channel('notification-center')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();

    const interval = setInterval(fetchNotifications, 60000);

    return () => {
      window.clearTimeout(fetchTimer);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchNotifications, supabase]);

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

  const markAllSeen = useCallback(() => {
    setUnread(0);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SEEN_STORAGE_KEY, String(Date.now()));
    }
  }, []);

  const handleToggle = () => {
    setOpen(prev => !prev);
    if (!open) markAllSeen();
  };

  return (
    <div className={styles.container} ref={ref}>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        {unread > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <Bell size={20} strokeWidth={1.6} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h4 className={styles.dropdownTitle}>Notifications</h4>
            <button className={styles.markReadBtn} onClick={markAllSeen} type="button">
              Mark all as read
            </button>
          </div>

          <div className={styles.dropdownBody}>
            {!hasFetched ? (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={`notif-skel-${i}`} className={styles.notifItem} aria-busy="true">
                    <div className={styles.notifDot} aria-hidden />
                    <div className={styles.notifContent}>
                      <span className={`skeleton ${styles.skelTitle}`} aria-hidden />
                      <span className={`skeleton ${styles.skelDesc}`} aria-hidden />
                    </div>
                  </div>
                ))}
              </>
            ) : items.length === 0 ? (
              <div className={styles.emptyNotif}>You&apos;re all caught up</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className={styles.notifItem}>
                  <div
                    className={`${styles.notifDot} ${styles[DOT_CLASS[item.color] || 'dotGreen']}`}
                  />
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
