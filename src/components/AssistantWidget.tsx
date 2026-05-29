'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import styles from './AssistantWidget.module.css';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Minimal inline renderer for the assistant's text: turns [label](url) into
 * clickable links (internal /dashboard links navigate in-app) and **bold** into
 * <strong>. Deliberately tiny — no markdown dependency.
 */
function renderRich(text: string, linkClass: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((\/[^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      nodes.push(
        <a key={key++} href={m[2]} className={linkClass}>
          {m[1]}
        </a>,
      );
    } else if (m[3]) {
      nodes.push(<strong key={key++}>{m[3]}</strong>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const SUGGESTIONS = [
  'Find US buyers for black pepper',
  "What's the market for turmeric?",
  'Show my top opportunities',
  'Draft outreach to my best buyer',
];

/**
 * Floating trade-intelligence copilot. Talks to /api/assistant (Claude + tools)
 * which can run real agents — discover buyers, pull market intel, manage the
 * pipeline, draft outreach — and remembers the conversation across sessions.
 */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const loadedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/assistant');
      const j = await r.json();
      if (j?.success && Array.isArray(j.messages)) {
        setMessages(j.messages.map((m: Msg) => ({ role: m.role, content: m.content })));
        scrollToBottom();
      }
    } catch {
      /* non-fatal */
    }
  }, [scrollToBottom]);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    // Defer off the effect's synchronous pass (project set-state-in-effect rule).
    const timer = window.setTimeout(() => loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [open, loadHistory]);

  useEffect(() => {
    if (open) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [open, messages, scrollToBottom]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setInput('');
      setSending(true);
      setMessages((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: '' }]);

      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        if (!res.ok || !res.body) {
          let err = 'Something went wrong. Please try again.';
          try {
            const j = await res.json();
            if (j?.error) err = j.error;
          } catch {
            /* keep default */
          }
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: err };
            return next;
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffered = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: buffered };
            return next;
          });
          scrollToBottom();
        }
        if (!buffered.trim()) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: 'Done.' };
            return next;
          });
        }
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: 'Network error — please try again.' };
          return next;
        });
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [sending, scrollToBottom],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const lastIsEmptyAssistant =
    sending && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !messages[messages.length - 1].content;

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
      >
        {open ? <X size={22} strokeWidth={2} /> : <Sparkles size={22} strokeWidth={1.8} />}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Trade assistant">
          <div className={styles.header}>
            <Sparkles size={16} strokeWidth={1.8} className={styles.headerIcon} />
            <div className={styles.headerText}>
              <span className={styles.headerTitle}>Trade Copilot</span>
              <span className={styles.headerSub}>Finds buyers · markets · drafts outreach</span>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          <div className={styles.messages} ref={scrollRef}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>Ask me anything about your trade.</p>
                <p className={styles.emptyBody}>
                  I can find real buyers, size a market, check your pipeline, and draft outreach — just ask.
                </p>
                <div className={styles.suggestions}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className={styles.suggestion} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              const showThinking = lastIsEmptyAssistant && i === messages.length - 1;
              return (
                <div key={i} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : styles.msgBot}`}>
                  {showThinking ? (
                    <span className={styles.thinking}>
                      <Loader2 size={14} className={styles.spin} /> Working on it…
                    </span>
                  ) : (
                    <span className={styles.msgText}>
                      {m.role === 'assistant' ? renderRich(m.content, styles.msgLink) : m.content}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.inputBar}>
            <textarea
              ref={inputRef}
              className={styles.input}
              placeholder="Find buyers, check markets, draft outreach…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={sending}
            />
            <button
              type="button"
              className={styles.sendBtn}
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              aria-label="Send"
            >
              {sending ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} strokeWidth={2} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
