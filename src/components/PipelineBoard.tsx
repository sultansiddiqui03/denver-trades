'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Clock, Download } from 'lucide-react';
import { useToast } from '@/components/Toast';
import IntentChip from '@/components/IntentChip';
import { exportToCsv } from '@/lib/exportCsv';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import {
  DEAL_STAGES,
  STAGE_META,
  normalizeStage,
  type DealStage,
  type StageMeta,
} from '@/lib/pipeline/stages';
import { type CompanyType } from '@/lib/intent';
import styles from './PipelineBoard.module.css';

export interface PipelineDeal {
  id: string;
  dealCode: string | null;
  title: string;
  stage: DealStage;
  valueUsd: number | null;
  products: string[];
  updatedAt: string | null;
  company: {
    id: string;
    name: string;
    type: CompanyType | null;
  } | null;
}

interface PipelineBoardProps {
  initialDeals: PipelineDeal[];
}

const DEAL_VALUE_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const COMPACT_VALUE_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatDealValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${DEAL_VALUE_FORMATTER.format(value)} USD`;
}

function formatStageTotal(total: number): string {
  if (total <= 0) return '$0';
  return COMPACT_VALUE_FORMATTER.format(total);
}

export default function PipelineBoard({ initialDeals }: PipelineBoardProps) {
  const { toast } = useToast();
  const [deals, setDeals] = useState<PipelineDeal[]>(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<string | null>(null);

  // Touch-friendly drag threshold — wait for ~6px of movement before kicking
  // off a drag so taps still focus the card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<DealStage, PipelineDeal[]>();
    for (const stage of DEAL_STAGES) grouped.set(stage, []);
    for (const deal of deals) {
      grouped.get(deal.stage)?.push(deal);
    }
    return grouped;
  }, [deals]);

  const persistStage = useCallback(
    async (id: string, nextStage: DealStage) => {
      setSavingState('Saving…');
      try {
        const res = await fetch(`/api/deals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: nextStage }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error || `Request failed (${res.status})`);
        }
        setSavingState('Saved');
        toast(`Moved to ${nextStage}`, 'success');
        window.setTimeout(() => setSavingState(null), 1800);
      } catch (err) {
        console.error('Stage update failed', err);
        setSavingState('Offline — change kept locally');
        toast('Could not save stage change', 'error');
        window.setTimeout(() => setSavingState(null), 2800);
      }
    },
    [toast]
  );

  const moveDeal = useCallback(
    (id: string, nextStage: DealStage) => {
      let changed = false;
      setDeals((prev) =>
        prev.map((deal) => {
          if (deal.id !== id) return deal;
          if (deal.stage === nextStage) return deal;
          changed = true;
          return { ...deal, stage: nextStage, updatedAt: new Date().toISOString() };
        })
      );
      if (changed) {
        void persistStage(id, nextStage);
      }
    },
    [persistStage]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const nextStage = normalizeStage(String(over.id));
    moveDeal(dealId, nextStage);
  };

  const handleStageSelect = (id: string, nextStage: DealStage) => {
    moveDeal(id, nextStage);
  };

  const handleExport = () => {
    if (deals.length === 0) return;
    exportToCsv(
      'denver-trades-pipeline',
      deals.map((d) => ({
        Code: d.dealCode ?? '',
        Company: d.company?.name ?? '',
        Title: d.title,
        Stage: d.stage,
        Value: d.valueUsd ?? '',
        Products: d.products.join('; '),
        UpdatedAt: d.updatedAt ?? '',
      }))
    );
    toast(`Exported ${deals.length} deals to CSV`, 'success');
  };

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  return (
    <div className={`${styles.container} fade-in`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>A pipeline that speaks trade, not software</h1>
          <p className={styles.subtitle}>
            Nine stages mapped to how a commodity deal actually flows — from
            first contact through sample, quote, P/O and onto the water.
          </p>
        </div>
        <div className={styles.headerActions}>
          {savingState && (
            <div className={styles.savingBadge}>
              <span className={styles.savingDot} aria-hidden="true" />
              {savingState}
            </div>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExport}
            disabled={deals.length === 0}
          >
            <Download size={14} strokeWidth={1.8} />
            Export CSV
          </button>
        </div>
      </header>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.board}>
          {STAGE_META.map((stage) => {
            const stageDeals = dealsByStage.get(stage.key) ?? [];
            return (
              <StageColumn
                key={stage.key}
                stage={stage}
                deals={stageDeals}
                onStageSelect={handleStageSelect}
                draggingId={activeId}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDeal ? <DealCardPreview deal={activeDeal} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface StageColumnProps {
  stage: StageMeta;
  deals: PipelineDeal[];
  onStageSelect: (id: string, nextStage: DealStage) => void;
  draggingId: string | null;
}

function StageColumn({ stage, deals, onStageSelect, draggingId }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = deals.reduce((sum, d) => sum + (d.valueUsd ?? 0), 0);
  const variantClass = styles[`stage_${stage.variant}`] ?? '';

  return (
    <section
      ref={setNodeRef}
      className={`${styles.column} ${variantClass} ${isOver ? styles.columnOver : ''}`}
      aria-label={`${stage.label} stage`}
    >
      <header className={styles.columnHeader}>
        <div className={styles.columnHeaderTop}>
          <span className={`${styles.stagePill} ${variantClass}`}>{stage.label}</span>
          <span className={styles.countBadge}>{deals.length}</span>
        </div>
        <span className={styles.columnTotal}>{formatStageTotal(total)} pipeline</span>
      </header>

      <div className={styles.cardList}>
        {deals.map((deal) => (
          <DraggableDealCard
            key={deal.id}
            deal={deal}
            onStageSelect={onStageSelect}
            isDragging={draggingId === deal.id}
          />
        ))}
        {deals.length === 0 && (
          <div className={styles.emptyStage}>
            <span>{stage.description}</span>
          </div>
        )}
      </div>
    </section>
  );
}

interface DraggableDealCardProps {
  deal: PipelineDeal;
  onStageSelect: (id: string, nextStage: DealStage) => void;
  isDragging: boolean;
}

function DraggableDealCard({ deal, onStageSelect, isDragging }: DraggableDealCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.cardWrap} ${isDragging ? styles.cardDragging : ''}`}
    >
      <DealCard
        deal={deal}
        onStageSelect={onStageSelect}
        dragHandleProps={{ ...listeners, ...attributes }}
      />
    </div>
  );
}

interface DealCardProps {
  deal: PipelineDeal;
  onStageSelect: (id: string, nextStage: DealStage) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function DealCard({ deal, onStageSelect, dragHandleProps }: DealCardProps) {
  const products = deal.products ?? [];
  const visibleProducts = products.slice(0, 2);
  const extraProducts = Math.max(0, products.length - visibleProducts.length);
  const updatedLabel = formatRelativeTime(deal.updatedAt);

  return (
    <article className={styles.card} aria-label={`Deal ${deal.dealCode ?? ''}`}>
      <div className={styles.cardGrip} {...dragHandleProps} aria-label="Drag handle" />

      <header className={styles.cardHeader}>
        <span className={styles.dealCode}>
          {deal.dealCode ?? 'LEAD-OPP-PENDING'}
        </span>
        {deal.company ? (
          <IntentChip type={deal.company.type} />
        ) : (
          <IntentChip type={null} />
        )}
      </header>

      {deal.company ? (
        <Link
          href={`/dashboard/companies/${deal.company.id}`}
          className={styles.companyLink}
        >
          {deal.company.name}
        </Link>
      ) : (
        <span className={styles.companyFallback}>{deal.title}</span>
      )}

      {deal.company && deal.title && (
        <span className={styles.dealTitle}>{deal.title}</span>
      )}

      {products.length > 0 && (
        <div className={styles.chipRow}>
          {visibleProducts.map((p) => (
            <span key={p} className={styles.chip}>
              {p}
            </span>
          ))}
          {extraProducts > 0 && (
            <span className={styles.chipMore}>+{extraProducts} more</span>
          )}
        </div>
      )}

      <footer className={styles.cardFooter}>
        <span className={styles.value}>{formatDealValue(deal.valueUsd)}</span>
        {updatedLabel && (
          <span className={styles.updated}>
            <Clock size={12} strokeWidth={1.8} />
            Updated {updatedLabel}
          </span>
        )}
      </footer>

      <select
        className={styles.stageSelect}
        value={deal.stage}
        onChange={(event) => {
          const next = event.target.value;
          if (DEAL_STAGES.includes(next as DealStage)) {
            onStageSelect(deal.id, next as DealStage);
          }
        }}
        aria-label="Change stage"
      >
        {DEAL_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </select>
    </article>
  );
}

function DealCardPreview({ deal }: { deal: PipelineDeal }) {
  return (
    <div className={`${styles.cardWrap} ${styles.cardPreview}`}>
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <span className={styles.dealCode}>{deal.dealCode ?? 'LEAD-OPP-PENDING'}</span>
          <IntentChip type={deal.company?.type ?? null} />
        </header>
        <span className={styles.companyFallback}>
          {deal.company?.name ?? deal.title}
        </span>
        <span className={styles.value}>{formatDealValue(deal.valueUsd)}</span>
      </article>
    </div>
  );
}
