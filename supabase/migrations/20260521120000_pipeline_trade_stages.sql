-- Trade-aware pipeline stages.
-- Replaces the legacy free-text stage ('Discovery', 'Outreach', 'Negotiation',
-- 'Audit', 'Closed', plus the 'New' default) with the nine stages a real
-- commodity deal travels through: New Lead -> Qualified -> Sample Sent ->
-- Quote Issued -> Negotiation -> PO Confirmed -> Shipped -> Closed Won /
-- Closed Lost. The kanban groups Closed Won / Closed Lost into the same
-- terminal column visually but they remain distinct values so reporting can
-- separate them.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Map legacy stage values onto the new taxonomy BEFORE adding the CHECK
--    constraint. Anything unrecognised falls back to 'New Lead' so no row
--    is left in violation.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.deals_pipeline
SET stage = CASE
  WHEN stage ILIKE 'new%'                      THEN 'New Lead'
  WHEN stage ILIKE 'lead%'                     THEN 'New Lead'
  WHEN stage ILIKE 'discovery%'                THEN 'New Lead'
  WHEN stage ILIKE 'outreach%'                 THEN 'Qualified'
  WHEN stage ILIKE 'qualified%'                THEN 'Qualified'
  WHEN stage ILIKE 'sample%'                   THEN 'Sample Sent'
  WHEN stage ILIKE 'proposal%'                 THEN 'Quote Issued'
  WHEN stage ILIKE 'quote%'                    THEN 'Quote Issued'
  WHEN stage ILIKE 'negotiation%'              THEN 'Negotiation'
  WHEN stage ILIKE 'po %' OR stage ILIKE 'po%' THEN 'PO Confirmed'
  WHEN stage ILIKE 'confirmed%'                THEN 'PO Confirmed'
  WHEN stage ILIKE 'shipped%'                  THEN 'Shipped'
  WHEN stage ILIKE 'audit%'                    THEN 'Shipped'
  WHEN stage ILIKE 'closed won%'               THEN 'Closed Won'
  WHEN stage ILIKE 'won%'                      THEN 'Closed Won'
  WHEN stage ILIKE 'closed lost%'              THEN 'Closed Lost'
  WHEN stage ILIKE 'lost%'                     THEN 'Closed Lost'
  WHEN stage ILIKE 'closed%'                   THEN 'Closed Won'
  ELSE 'New Lead'
END
WHERE stage IS NULL OR stage NOT IN (
  'New Lead','Qualified','Sample Sent','Quote Issued',
  'Negotiation','PO Confirmed','Shipped','Closed Won','Closed Lost'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Lock the stage column to the new taxonomy. Default rolls over to
--    'New Lead' so any code that inserts without specifying stage lands
--    in the right column.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.deals_pipeline
  ALTER COLUMN stage SET DEFAULT 'New Lead';

ALTER TABLE public.deals_pipeline
  DROP CONSTRAINT IF EXISTS deals_pipeline_stage_check;

ALTER TABLE public.deals_pipeline
  ADD CONSTRAINT deals_pipeline_stage_check
  CHECK (stage IN (
    'New Lead','Qualified','Sample Sent','Quote Issued',
    'Negotiation','PO Confirmed','Shipped','Closed Won','Closed Lost'
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Human-readable deal code. LEAD-OPP-YYYY-NNNNN where NNNNN is a five
--    digit zero-padded sequence. Backfilled in creation order so the
--    earliest deal in the org gets 00001.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.deals_pipeline
  ADD COLUMN IF NOT EXISTS deal_code TEXT;

WITH numbered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY org_id ORDER BY created_at, id) AS seq,
    to_char(COALESCE(created_at, NOW()), 'YYYY') AS yr
  FROM public.deals_pipeline
  WHERE deal_code IS NULL
)
UPDATE public.deals_pipeline d
SET deal_code = 'LEAD-OPP-' || n.yr || '-' || lpad(n.seq::text, 5, '0')
FROM numbered n
WHERE d.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_pipeline_deal_code
  ON public.deals_pipeline(deal_code)
  WHERE deal_code IS NOT NULL;

COMMENT ON COLUMN public.deals_pipeline.stage IS
  'Nine-stage commodity-deal pipeline: New Lead -> Qualified -> Sample Sent -> Quote Issued -> Negotiation -> PO Confirmed -> Shipped -> Closed Won/Closed Lost. Enforced by deals_pipeline_stage_check.';

COMMENT ON COLUMN public.deals_pipeline.deal_code IS
  'Human-readable identifier shown on the kanban card, e.g. LEAD-OPP-2026-00091. Backfilled in creation order; new rows should be assigned via the API or a separate sequence-generation policy.';
