-- Canonical-company entity resolution: provenance log.
--
-- A single buyer can surface from multiple sources (ImportYeti US lookup,
-- product-discovery harvest, future commercial customs APIs, enrichment
-- providers). To keep ONE canonical company row per real-world company, the
-- ingest now merges into an existing row when it fuzzy-matches by name+country
-- instead of inserting a duplicate — and records every contributing source
-- here so the dossier can show "seen in: ImportYeti, discovery(black pepper)".
--
-- Shape: array of { source: text, ref: text|null, at: timestamptz }.
alter table companies
  add column if not exists sources jsonb not null default '[]'::jsonb;

comment on column companies.sources is
  'Provenance log for entity resolution: array of { source, ref, at } recording which data sources contributed to this canonical company record.';
