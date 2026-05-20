'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Bot,
  Download,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LineChart,
  Mail,
  MessageSquarePlus,
  Play,
  Search,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './CommandPalette.module.css';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  path: string;
  Icon: LucideIcon;
  category: 'Navigate' | 'Action';
}

const commands: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Overview & stats', path: '/dashboard', category: 'Navigate', Icon: LayoutDashboard },
  { id: 'search', label: 'AI Search', description: 'Find importers & exporters', path: '/dashboard/search', category: 'Navigate', Icon: Search },
  { id: 'pipeline', label: 'Pipeline', description: 'Manage deals & stages', path: '/dashboard/pipeline', category: 'Navigate', Icon: KanbanSquare },
  { id: 'outreach', label: 'Outreach', description: 'WhatsApp & email', path: '/dashboard/outreach', category: 'Navigate', Icon: Mail },
  { id: 'documents', label: 'Documents', description: 'Compliance audit', path: '/dashboard/documents', category: 'Navigate', Icon: FileText },
  { id: 'analytics', label: 'Analytics', description: 'Charts & metrics', path: '/dashboard/analytics', category: 'Navigate', Icon: BarChart3 },
  { id: 'agents', label: 'Agents', description: 'AI scraper & automations', path: '/dashboard/agents', category: 'Navigate', Icon: Bot },
  { id: 'prices', label: 'Prices', description: 'Commodity price feeds', path: '/dashboard/prices', category: 'Navigate', Icon: LineChart },
  { id: 'settings', label: 'Settings', description: 'API keys & config', path: '/dashboard/settings', category: 'Navigate', Icon: Settings },
  { id: 'run-scraper', label: 'Run Lead Scraper', description: 'Trigger Apify agent', path: '/dashboard/agents', category: 'Action', Icon: Play },
  { id: 'new-whatsapp', label: 'New WhatsApp Message', description: 'Send outbound message', path: '/dashboard/outreach', category: 'Action', Icon: MessageSquarePlus },
  { id: 'export-csv', label: 'Export Companies CSV', description: 'Download search results', path: '/dashboard/search', category: 'Action', Icon: Download },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const filtered = commands.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      const timer = window.setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 50);

      return () => {
        window.clearTimeout(timer);
        // Return focus to whatever opened the palette (button, link, etc.)
        previouslyFocusedRef.current?.focus?.();
      };
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      router.push(item.path);
      onClose();
    },
    [router, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filtered, selectedIndex, handleSelect, onClose]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const navigateItems = filtered.filter((c) => c.category === 'Navigate');
  const actionItems = filtered.filter((c) => c.category === 'Action');
  let globalIdx = -1;

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className={styles.searchRow}>
          <Search size={20} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Type a command or search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command search"
          />
          <kbd className={styles.kbd}>ESC</kbd>
        </div>

        <div className={styles.results}>
          {filtered.length === 0 && (
            <div className={styles.noResults}>No results for &ldquo;{query}&rdquo;</div>
          )}

          {navigateItems.length > 0 && (
            <>
              <div className={styles.groupLabel}>Navigate</div>
              {navigateItems.map((item) => {
                globalIdx++;
                const idx = globalIdx;
                return (
                  <button
                    key={item.id}
                    className={`${styles.resultItem} ${idx === selectedIndex ? styles.selected : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className={styles.resultIcon}>
                      <item.Icon size={18} strokeWidth={1.5} />
                    </span>
                    <div className={styles.resultText}>
                      <span className={styles.resultLabel}>{item.label}</span>
                      <span className={styles.resultDesc}>{item.description}</span>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {actionItems.length > 0 && (
            <>
              <div className={styles.groupLabel}>Actions</div>
              {actionItems.map((item) => {
                globalIdx++;
                const idx = globalIdx;
                return (
                  <button
                    key={item.id}
                    className={`${styles.resultItem} ${idx === selectedIndex ? styles.selected : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className={styles.resultIcon}>
                      <item.Icon size={18} strokeWidth={1.5} />
                    </span>
                    <div className={styles.resultText}>
                      <span className={styles.resultLabel}>{item.label}</span>
                      <span className={styles.resultDesc}>{item.description}</span>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span><kbd className={styles.kbd}>↑↓</kbd> Navigate</span>
          <span><kbd className={styles.kbd}>↵</kbd> Select</span>
          <span><kbd className={styles.kbd}>ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
