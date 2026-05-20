'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  ChevronLeft,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LineChart,
  Mail,
  Search,
  Settings,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './Sidebar.module.css';

export const SIDEBAR_EXPANDED = 260;
export const SIDEBAR_COLLAPSED = 72;

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

interface NavItem {
  label: string;
  path: string;
  Icon: LucideIcon;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard },
  { label: 'Search', path: '/dashboard/search', Icon: Search },
  { label: 'Pipeline', path: '/dashboard/pipeline', Icon: KanbanSquare },
  { label: 'Outreach', path: '/dashboard/outreach', Icon: Mail },
  { label: 'Documents', path: '/dashboard/documents', Icon: FileText },
  { label: 'Analytics', path: '/dashboard/analytics', Icon: TrendingUp },
  { label: 'Agents', path: '/dashboard/agents', Icon: Bot },
  { label: 'Prices', path: '/dashboard/prices', Icon: LineChart },
];

const settingsItem: NavItem = {
  label: 'Settings',
  path: '/dashboard/settings',
  Icon: Settings,
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
          <ChevronLeft size={16} />
        </button>
      </div>

      <nav className={styles.nav}>
        {navItems.map(({ label, path, Icon }) => (
          <Link
            key={path}
            href={path}
            onClick={handleLinkClick}
            className={`${styles.navItem} ${isActive(path) ? styles.active : ''}`}
            title={collapsed ? label : undefined}
          >
            <span className={styles.navIcon}>
              <Icon size={20} strokeWidth={1.6} />
            </span>
            <span className={styles.navLabel}>{label}</span>
          </Link>
        ))}
      </nav>

      <div className={styles.bottomSection}>
        <Link
          href={settingsItem.path}
          onClick={handleLinkClick}
          className={`${styles.navItem} ${isActive(settingsItem.path) ? styles.active : ''}`}
          title={collapsed ? settingsItem.label : undefined}
        >
          <span className={styles.navIcon}>
            <settingsItem.Icon size={20} strokeWidth={1.6} />
          </span>
          <span className={styles.navLabel}>{settingsItem.label}</span>
        </Link>
      </div>
    </aside>
  );
}
