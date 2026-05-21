CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════ MULTI-TENANCY ═══════════

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    commodities TEXT[] DEFAULT '{}',
    target_markets TEXT[] DEFAULT '{}',
    logo_url TEXT,
    onboarding_complete BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    twilio_whatsapp_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_twilio_whatsapp_number
  ON organizations(twilio_whatsapp_number)
  WHERE twilio_whatsapp_number IS NOT NULL;

CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    email VARCHAR(255) NOT NULL,
    onboarding_step INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════ CORE DATA ═══════════

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) CHECK (type IN ('Importer', 'Exporter', 'Broker')),
    hq_country VARCHAR(100),
    hq_city VARCHAR(100),
    origin_countries TEXT[],
    destination_countries TEXT[],
    products_dealt TEXT[],
    website VARCHAR(500),
    description TEXT,
    contacts JSONB DEFAULT '[]',
    tags TEXT[] DEFAULT '{}',
    is_favorited BOOLEAN DEFAULT FALSE,
    is_enriched BOOLEAN DEFAULT FALSE,
    enriched_at TIMESTAMPTZ,
    enrichment_source VARCHAR(100),
    confidence_score NUMERIC(3,2),
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    product VARCHAR(255) NOT NULL,
    hs_code VARCHAR(12),
    port_loading VARCHAR(100),
    port_discharge VARCHAR(100),
    weight_kg NUMERIC,
    container_count INTEGER,
    shipment_date DATE,
    carrier VARCHAR(100),
    source_reference VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deals_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    value_usd NUMERIC(15,2),
    quantity_mt NUMERIC(12,3),
    product VARCHAR(255),
    stage VARCHAR(50) DEFAULT 'New',
    incoterm VARCHAR(10) CHECK (incoterm IN ('FOB','CIF','EXW','DDP','CFR','CIP','DAP')),
    port_loading VARCHAR(100),
    port_discharge VARCHAR(100),
    payment_terms VARCHAR(255),
    expected_close_date DATE,
    assigned_to UUID REFERENCES users(id),
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    kanban_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outreach_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    deal_id UUID REFERENCES deals_pipeline(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    channel VARCHAR(20) CHECK (channel IN ('Email','WhatsApp','SMS')),
    direction VARCHAR(10) CHECK (direction IN ('Inbound','Outbound')),
    sender VARCHAR(255),
    recipient VARCHAR(255),
    subject VARCHAR(500),
    message_content TEXT NOT NULL,
    extracted_terms JSONB,
    extracted_demand JSONB,
    ai_generated BOOLEAN DEFAULT FALSE,
    needs_review BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'Draft'
        CHECK (status IN ('Draft','Approved','Sent','Delivered','Read','Replied','Failed')),
    language VARCHAR(10) DEFAULT 'en',
    twilio_message_sid TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_threads_twilio_message_sid
  ON outreach_threads(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_threads_active_demand
  ON outreach_threads (org_id, created_at DESC)
  WHERE direction = 'Inbound'
    AND (extracted_demand->>'has_demand') = 'true';

CREATE TABLE document_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    deal_id UUID REFERENCES deals_pipeline(id) ON DELETE SET NULL,
    doc_type_a VARCHAR(100) NOT NULL,
    doc_path_a TEXT NOT NULL,
    doc_type_b VARCHAR(100) NOT NULL,
    doc_path_b TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending'
        CHECK (status IN ('Pending','Processing','Complete','Error')),
    discrepancies JSONB DEFAULT '[]',
    summary TEXT,
    report_pdf_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE commodity_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commodity VARCHAR(100) NOT NULL,
    origin_country VARCHAR(100),
    price_usd NUMERIC(12,2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'MT',
    source VARCHAR(255),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════ SYSTEM TABLES ═══════════

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    filters JSONB DEFAULT '{}',
    alert_enabled BOOLEAN DEFAULT FALSE,
    last_result_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'Running'
        CHECK (status IN ('Running','Success','Failed','Cancelled')),
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    error_log TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    deal_id UUID REFERENCES deals_pipeline(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id),
    actor_name VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════ ROW LEVEL SECURITY ═══════════
-- NOTE: policies live in supabase/migrations/20260520193000_auth_rls_hardening.sql
-- and 20260520194500_optimize_rls_auth_calls.sql. Apply those after schema.sql
-- on a fresh install so policies (not just RLS enable) are in place.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
-- commodity_prices is intentionally global market data — no RLS (P1-11).

-- ═══════════ INDEXES ═══════════

CREATE INDEX idx_companies_org ON companies(org_id);
CREATE INDEX idx_companies_favorited ON companies(org_id, is_favorited) WHERE is_favorited = TRUE;
CREATE INDEX idx_shipments_company ON shipments(company_id);
CREATE INDEX idx_deals_stage ON deals_pipeline(org_id, stage);
CREATE INDEX idx_deals_company ON deals_pipeline(company_id);
CREATE INDEX idx_outreach_deal ON outreach_threads(deal_id);
CREATE INDEX idx_prices_commodity ON commodity_prices(commodity, recorded_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_activity_deal ON activity_feed(deal_id, created_at DESC);
CREATE INDEX idx_saved_searches_user ON saved_searches(user_id);
