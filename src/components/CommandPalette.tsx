'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './CommandPalette.module.css';

interface CommandItem {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  category: 'Navigate' | 'Action';
}

const commands: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Overview & stats', path: '/dashboard', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="7" height="7" rx="2" /><rect x="11" y="2" width="7" height="7" rx="2" /><rect x="2" y="11" width="7" height="7" rx="2" /><rect x="11" y="11" width="7" height="7" rx="2" /></svg> },
  { id: 'search', label: 'AI Search', description: 'Find importers & exporters', path: '/dashboard/search', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" /></svg> },
  { id: 'pipeline', label: 'Pipeline', description: 'Manage deals & stages', path: '/dashboard/pipeline', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="5" height="14" rx="1.5" /><rect x="7.5" y="6" width="5" height="11" rx="1.5" /><rect x="13" y="1" width="5" height="16" rx="1.5" /></svg> },
  { id: 'outreach', label: 'Outreach', description: 'WhatsApp & email', path: '/dashboard/outreach', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="16" height="12" rx="2" /><path d="M2 6l8 5 8-5" /></svg> },
  { id: 'documents', label: 'Documents', description: 'Compliance audit', path: '/dashboard/documents', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z" /><path d="M12 2v5h5" /></svg> },
  { id: 'analytics', label: 'Analytics', description: 'Charts & metrics', path: '/dashboard/analytics', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="18 6 12 12 8 8 2 14" /><polyline points="14 6 18 6 18 10" /></svg> },
  { id: 'agents', label: 'Agents', description: 'AI scraper & automations', path: '/dashboard/agents', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="12" height="12" rx="2" /><circle cx="8" cy="9" r="1" fill="currentColor" /><circle cx="12" cy="9" r="1" fill="currentColor" /><path d="M8.5 12.5h3" /></svg> },
  { id: 'prices', label: 'Prices', description: 'Commodity price feeds', path: '/dashboard/prices', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="2 16 6 10 10 13 14 7 18 4" /></svg> },
  { id: 'settings', label: 'Settings', description: 'API keys & config', path: '/dashboard/settings', category: 'Navigate', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="3" /><path d="M10 1v2M10 17v2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M1 10h2M17 10h2M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" /></svg> },
  { id: 'run-scraper', label: 'Run Lead Scraper', description: 'Trigger Apify agent', path: '/dashboard/agents', category: 'Action', icon: <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="5 3 19 10 5 17 5 3" /></svg> },
  { id: 'new-whatsapp', label: 'New WhatsApp Message', description: 'Send outbound message', path: '/dashboard/outreach', category: 'Action', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> },
  { id: 'export-csv', label: 'Export Companies CSV', description: 'Download search results', path: '/dashboard/search', category: 'Action', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg> },
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

  const filtered = commands.filter((cmd) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || cmd.description.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 50);

      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSelect = useCallback((item: CommandItem) => {
    router.push(item.path);
    onClose();
  }, [router, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
  }, [filtered, selectedIndex, handleSelect, onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  const navigateItems = filtered.filter(c => c.category === 'Navigate');
  const actionItems = filtered.filter(c => c.category === 'Action');
  let globalIdx = -1;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className={styles.searchRow}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
            <circle cx="8.5" cy="8.5" r="5.5" /><path d="M13 13l4 4" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
                    <span className={styles.resultIcon}>{item.icon}</span>
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
                    <span className={styles.resultIcon}>{item.icon}</span>
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
