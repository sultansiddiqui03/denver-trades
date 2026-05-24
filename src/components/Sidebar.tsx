'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bot,
  Building2,
  ChevronLeft,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LineChart,
  Mail,
  Send,
  Settings,
  ShoppingCart,
  Target,
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

interface NavGroup {
  heading?: string;
  items: NavItem[];
}

// Grouped sections mirror the vertical-trade-CRM convention (Tradyon et al.):
// Market Research (find buyers/sellers) → CRM (deal motion) → Tools (everything
// that powers the pipeline). Active highlight is per-link.
const navGroups: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard }],
  },
  {
    heading: 'Market research',
    items: [
      { label: 'Find Buyers', path: '/dashboard/search?intent=buyers', Icon: ShoppingCart },
      { label: 'Find Sellers', path: '/dashboard/search?intent=sellers', Icon: Send },
      { label: 'Companies', path: '/dashboard/companies', Icon: Building2 },
      { label: 'Buyer Match', path: '/dashboard/matches', Icon: Target },
    ],
  },
  {
    heading: 'CRM',
    items: [
      { label: 'Pipeline', path: '/dashboard/pipeline', Icon: KanbanSquare },
      { label: 'Outreach', path: '/dashboard/outreach', Icon: Mail },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { label: 'Documents', path: '/dashboard/documents', Icon: FileText },
      { label: 'Analytics', path: '/dashboard/analytics', Icon: TrendingUp },
      { label: 'Agents', path: '/dashboard/agents', Icon: Bot },
      { label: 'Prices', path: '/dashboard/prices', Icon: LineChart },
    ],
  },
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
  // Active highlighting honours the ?intent= query so Find Buyers vs Find
  // Sellers can both share /dashboard/search without lighting up together.
  const search = typeof window !== 'undefined' ? window.location.search : '';

  const isActive = (linkPath: string) => {
    const [target, targetQuery] = linkPath.split('?');
    if (target === '/dashboard') return pathname === '/dashboard';
    if (!pathname.startsWith(target)) return false;
    if (!targetQuery) {
      // Plain link wins only when there's no competing query-discriminated link
      // (Find Buyers / Find Sellers both live at /dashboard/search).
      if (target === '/dashboard/search' && search.includes('intent=')) return false;
      return true;
    }
    // Crude match — fine because we only discriminate by `intent` today.
    const targetParams = new URLSearchParams(targetQuery);
    const intent = targetParams.get('intent');
    if (!intent) return true;
    return search.includes(`intent=${intent}`);
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
        {navGroups.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`} className={styles.navGroup}>
            {group.heading ? (
              <div className={styles.navGroupHeading}>{group.heading}</div>
            ) : null}
            {group.items.map(({ label, path, Icon }) => (
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
          </div>
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
