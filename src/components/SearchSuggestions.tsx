'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import styles from './SearchSuggestions.module.css';

/**
 * Typeahead suggestion dropdown that appears under the AI search input
 * while the user is typing. Pure client-side filtering against a static
 * commodity × country template product set — NO API calls.
 *
 * Companion to the existing static "Try" badge row: that stays for the
 * empty-input state, this kicks in once the user starts typing.
 */

const COMMODITIES = [
  'Black pepper',
  'White pepper',
  'Green cardamom',
  'Black cardamom',
  'Robusta coffee',
  'Arabica coffee',
  'Cashew',
  'Cashew kernels',
  'Basmati rice',
  'Parboiled rice',
  'Tea',
  'Saffron',
  'Turmeric',
  'Coriander seed',
  'Cumin seed',
  'Chilli',
  'Cloves',
  'Nutmeg',
  'Cinnamon',
];

const COUNTRIES = [
  'UAE',
  'Saudi Arabia',
  'India',
  'Vietnam',
  'Brazil',
  'Turkey',
  'Indonesia',
  'Egypt',
  'Sri Lanka',
];

type TemplateKind = 'buyers' | 'exporters' | 'suppliers' | 'importers';

interface Template {
  kind: TemplateKind;
  render: (commodity: string, country: string | null) => string;
}

const TEMPLATES: Template[] = [
  { kind: 'buyers', render: (c, k) => (k ? `${c} buyers in ${k}` : `${c} buyers`) },
  { kind: 'exporters', render: (c, k) => (k ? `${c} exporters in ${k}` : `${c} exporters`) },
  { kind: 'suppliers', render: (c, k) => (k ? `${c} suppliers in ${k}` : `${c} suppliers`) },
  { kind: 'importers', render: (c, k) => (k ? `${c} importers in ${k}` : `${c} importers`) },
];

interface ScoredSuggestion {
  text: string;
  score: number;
}

/**
 * Score a candidate string against the user's typed query. Higher = better.
 *
 *   + 100  a token in the query is a prefix of a token in the candidate
 *   + 30   a token in the query appears anywhere in the candidate
 *   + 5    base for any all-tokens match (keeps the order stable)
 *
 * Prefix matches always rank above substring-only matches so typing
 * "pep" surfaces "Black pepper buyers …" before "Black peppercorn …".
 */
function scoreCandidate(candidate: string, queryTokens: string[]): number {
  const candidateLower = candidate.toLowerCase();
  const candidateTokens = candidateLower.split(/\s+/);

  let score = 5;
  for (const qt of queryTokens) {
    const anywhere = candidateLower.includes(qt);
    if (!anywhere) return 0; // require every typed token to match somewhere
    const isPrefix = candidateTokens.some((ct) => ct.startsWith(qt));
    score += isPrefix ? 100 : 30;
  }
  return score;
}

/**
 * Build candidate suggestion strings on demand from the commodity × country
 * × template cross-product. We don't precompute the full set (~684 entries)
 * — `tokenize → scoreCandidate` runs fast enough on every keystroke.
 */
function buildSuggestions(query: string, max: number): string[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [];

  const queryTokens = trimmed.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return [];

  const scored: ScoredSuggestion[] = [];

  for (const commodity of COMMODITIES) {
    // 1. Country-bound templates
    for (const country of COUNTRIES) {
      for (const tpl of TEMPLATES) {
        const text = tpl.render(commodity, country);
        const s = scoreCandidate(text, queryTokens);
        if (s > 0) scored.push({ text, score: s });
      }
    }
    // 2. Country-free templates
    for (const tpl of TEMPLATES) {
      const text = tpl.render(commodity, null);
      const s = scoreCandidate(text, queryTokens);
      if (s > 0) scored.push({ text, score: s });
    }
  }

  // Sort: higher score first, then shorter text first (more focused match).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.text.length - b.text.length;
  });

  // Dedupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scored) {
    if (seen.has(s.text)) continue;
    seen.add(s.text);
    out.push(s.text);
    if (out.length >= max) break;
  }
  return out;
}

interface SearchSuggestionsProps {
  /** Current value of the search input — drives filtering. */
  query: string;
  /** Called when the user picks a suggestion (click, Enter, or arrow+Enter). */
  onSelect: (suggestion: string) => void;
  /** Bubbles arrow-key navigation up so we can intercept from the input. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Whether the input currently has focus. The dropdown only shows when true. */
  isInputFocused: boolean;
  /** External "close me" signal — e.g. after the user submits the form. */
  onClose: () => void;
}

export default function SearchSuggestions({
  query,
  onSelect,
  inputRef,
  isInputFocused,
  onClose,
}: SearchSuggestionsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // `activeIndex` is stored as a number but only treated as a real selection
  // when it falls inside the current suggestions range — that lets the user's
  // typing implicitly reset the highlight without us mutating state during
  // render (the project's lint rule disallows that pattern).
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const suggestions = useMemo(() => buildSuggestions(query, 5), [query]);
  const isOpen = isInputFocused && suggestions.length > 0 && query.trim().length > 0;
  const effectiveActiveIndex =
    activeIndex >= 0 && activeIndex < suggestions.length ? activeIndex : -1;

  // Keyboard navigation — attach handlers to the input itself so we don't
  // need to fight focus management between the input and the list.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((cur) => {
          const next = cur + 1;
          return next >= suggestions.length ? 0 : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((cur) => {
          const next = cur - 1;
          return next < 0 ? suggestions.length - 1 : next;
        });
      } else if (e.key === 'Enter') {
        if (effectiveActiveIndex >= 0) {
          // Stop the form submit — onSelect handles it.
          e.preventDefault();
          onSelect(suggestions[effectiveActiveIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  }, [inputRef, isOpen, suggestions, effectiveActiveIndex, onSelect, onClose]);

  // Click outside → close. We listen on `mousedown` rather than `click` so
  // the dropdown closes before the next focusable element processes its
  // own click (which would steal focus and double-fire close).
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (inputRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, inputRef, onClose]);

  const handleClick = useCallback(
    (suggestion: string) => {
      onSelect(suggestion);
    },
    [onSelect]
  );

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      id="search-suggestions-listbox"
      className={styles.dropdown}
      role="listbox"
      aria-label="Search suggestions"
    >
      {suggestions.map((s, i) => (
        <button
          key={s}
          type="button"
          role="option"
          aria-selected={effectiveActiveIndex === i}
          className={`${styles.option} ${effectiveActiveIndex === i ? styles.optionActive : ''}`}
          onMouseEnter={() => setActiveIndex(i)}
          onMouseDown={(e) => {
            // Prevent the input from losing focus before our handler runs.
            e.preventDefault();
          }}
          onClick={() => handleClick(s)}
        >
          <Sparkles size={14} strokeWidth={1.8} className={styles.optionIcon} aria-hidden />
          <span className={styles.optionText}>{s}</span>
        </button>
      ))}
    </div>
  );
}
