-- pgvector semantic search for companies.
-- Uses cosine distance (<=>) consistently with the HNSW index below.
-- text-embedding-3-small is normalised, so cosine and L2 rank identically;
-- we pick cosine so the (1 - distance) similarity score is in [0, 1].

CREATE INDEX IF NOT EXISTS idx_companies_embedding_hnsw
  ON public.companies
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_companies_by_embedding(
  query_embedding extensions.vector(1536),
  match_org_id uuid,
  match_count int
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  hq_country text,
  description text,
  products_dealt text[],
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.name,
    c.type,
    c.hq_country,
    c.description,
    c.products_dealt,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM public.companies c
  WHERE c.org_id = match_org_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_companies_by_embedding(extensions.vector(1536), uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_companies_by_embedding(extensions.vector(1536), uuid, int) TO authenticated, service_role;
