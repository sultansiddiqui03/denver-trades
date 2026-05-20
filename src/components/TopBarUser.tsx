'use client';

import { useEffect, useMemo, useState } from 'react';
import { User as UserIcon } from 'lucide-react';
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

  if (!profile) {
    return (
      <div className={styles.profileSummary} aria-busy="true">
        <div className={styles.avatar} aria-hidden="true">
          <UserIcon size={16} />
        </div>
        <div className={styles.profileText}>
          <span className="skeleton" style={{ width: 96, height: 12, display: 'block' }} />
          <span
            className="skeleton"
            style={{ width: 64, height: 10, display: 'block', marginTop: 6 }}
          />
        </div>
      </div>
    );
  }

  const subline = profile.orgName
    ? `${titleCase(profile.role)} · ${profile.orgName}`
    : titleCase(profile.role);

  return (
    <div className={styles.profileSummary} title={profile.email || undefined}>
      <div className={styles.avatar}>{initialsFor(profile.fullName)}</div>
      <div className={styles.profileText}>
        <span className={styles.profileName}>{profile.fullName}</span>
        <span className={styles.profileRole}>{subline}</span>
      </div>
    </div>
  );
}
