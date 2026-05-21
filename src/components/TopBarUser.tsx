'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, Settings, User as UserIcon } from 'lucide-react';
import { signOut } from '@/app/auth/actions';
import { createClient } from '@/lib/supabase/client';
import styles from '@/app/dashboard/layout.module.css';

interface ProfileData {
  fullName: string;
  email: string;
  role: string;
  orgName: string;
}

function initialsFor(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function titleCase(s: string) {
  return s.length === 0 ? '' : s[0].toUpperCase() + s.slice(1);
}

export default function TopBarUser() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setProfile({
            fullName: 'Guest',
            email: '',
            role: 'viewer',
            orgName: '',
          });
        }
        return;
      }

      const { data: row } = await supabase
        .from('users')
        .select('full_name, email, role, organizations:org_id(name)')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      const orgRel = row?.organizations as { name?: string } | { name?: string }[] | null | undefined;
      const orgName = Array.isArray(orgRel) ? orgRel[0]?.name ?? '' : orgRel?.name ?? '';

      setProfile({
        fullName: row?.full_name || user.email?.split('@')[0] || 'User',
        email: row?.email || user.email || '',
        role: row?.role || 'member',
        orgName,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!profile) {
    return (
      <div className={styles.profileWrap}>
        <div className={styles.profileSummary} aria-busy="true">
          <div className={styles.avatar} aria-hidden="true">
            <UserIcon size={16} />
          </div>
          <div className={styles.profileText}>
            <span className={`skeleton ${styles.profileSkelName}`} aria-hidden />
            <span className={`skeleton ${styles.profileSkelRole}`} aria-hidden />
          </div>
        </div>
      </div>
    );
  }

  const subline = profile.orgName
    ? `${titleCase(profile.role)} · ${profile.orgName}`
    : titleCase(profile.role);

  return (
    <div className={styles.profileWrap} ref={containerRef}>
      <button
        type="button"
        className={styles.profileSummary}
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={profile.email || undefined}
      >
        <div className={styles.avatar}>{initialsFor(profile.fullName)}</div>
        <div className={styles.profileText}>
          <span className={styles.profileName}>{profile.fullName}</span>
          <span className={styles.profileRole}>{subline}</span>
        </div>
      </button>

      {menuOpen && (
        <div className={styles.profileMenu} role="menu">
          <div className={styles.profileMenuHeader}>
            <span className={styles.profileMenuName}>{profile.fullName}</span>
            {profile.email && (
              <span className={styles.profileMenuEmail}>{profile.email}</span>
            )}
          </div>
          <Link
            href="/dashboard/settings"
            role="menuitem"
            className={styles.profileMenuItem}
            onClick={() => setMenuOpen(false)}
          >
            <Settings size={15} strokeWidth={1.6} />
            <span>Settings</span>
          </Link>
          <form action={signOut} className={styles.profileMenuForm}>
            <button
              type="submit"
              role="menuitem"
              className={`${styles.profileMenuItem} ${styles.profileMenuItemDanger}`}
            >
              <LogOut size={15} strokeWidth={1.6} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
