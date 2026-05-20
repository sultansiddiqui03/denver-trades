'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

export const SIDEBAR_EXPANDED = 260;
export const SIDEBAR_COLLAPSED = 72;

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

const navItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="2" />
        <rect x="11" y="2" width="7" height="7" rx="2" />
        <rect x="2" y="11" width="7" height="7" rx="2" />
        <rect x="11" y="11" width="7" height="7" rx="2" />
      </svg>
    ),
  },
  {
    label: 'Search',
    path: '/dashboard/search',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M13 13l4 4" />
      </svg>
    ),
  },
  {
    label: 'Pipeline',
    path: '/dashboard/pipeline',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="5" height="14" rx="1.5" />
        <rect x="7.5" y="6" width="5" height="11" rx="1.5" />
        <rect x="13" y="1" width="5" height="16" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'Outreach',
    path: '/dashboard/outreach',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="16" height="12" rx="2" />
        <path d="M2 6l8 5 8-5" />
      </svg>
    ),
  },
  {
    label: 'Documents',
    path: '/dashboard/documents',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z" />
        <path d="M12 2v5h5" />
        <line x1="7" y1="10" x2="13" y2="10" />
        <line x1="7" y1="13" x2="11" y2="13" />
      </svg>
    ),
  },
  {
    label: 'Analytics',
    path: '/dashboard/analytics',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 6 12 12 8 8 2 14" />
        <polyline points="14 6 18 6 18 10" />
      </svg>
    ),
  },
  {
    label: 'Agents',
    path: '/dashboard/agents',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="12" height="12" rx="2" />
        <path d="M9 4V2" />
        <path d="M11 4V2" />
        <path d="M9 18v-2" />
        <path d="M11 18v-2" />
        <path d="M4 9H2" />
        <path d="M4 11H2" />
        <path d="M18 9h-2" />
        <path d="M18 11h-2" />
        <circle cx="8" cy="9" r="1" fill="currentColor" />
        <circle cx="12" cy="9" r="1" fill="currentColor" />
        <path d="M8.5 12.5h3" />
      </svg>
    ),
  },
  {
    label: 'Prices',
    path: '/dashboard/prices',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="2 16 6 10 10 13 14 7 18 4" />
        <circle cx="18" cy="4" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

const settingsItem = {
  label: 'Settings',
  path: '/dashboard/settings',
  icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1v2M10 17v2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M1 10h2M17 10h2M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  ),
};

export default function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen = false,
  setMobileOpen,
}: SidebarProps) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(path);
  };

  const handleLinkClick = () => {
    if (setMobileOpen) {
      setMobileOpen(false);
    }
  };

  return (
    <aside
      className={`${styles.sidebar} ${
        collapsed ? styles.collapsed : styles.expanded
      } ${mobileOpen ? styles.mobileOpen : ''}`}
    >
      {/* Logo */}
      <div className={styles.logoSection}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>D</div>
          <span className={styles.logoText}>
            <span className={styles.logoAccent}>Denver</span>
            <span className={styles.logoWhite}>Trades</span>
          </span>
        </div>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="10 3 5 8 10 13" />
          </svg>
        </button>
      </div>

      {/* Main Nav */}
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            onClick={handleLinkClick}
            className={`${styles.navItem} ${isActive(item.path) ? styles.active : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className={styles.bottomSection}>
        <Link
          href={settingsItem.path}
          onClick={handleLinkClick}
          className={`${styles.navItem} ${isActive(settingsItem.path) ? styles.active : ''}`}
        >
          <span className={styles.navIcon}>{settingsItem.icon}</span>
          <span className={styles.navLabel}>{settingsItem.label}</span>
        </Link>
      </div>
    </aside>
  );
}
