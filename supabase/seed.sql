-- Seed file for Denver-Trades database

-- 1. Create a Default Organization
INSERT INTO organizations (id, name, slug, commodities, target_markets, onboarding_complete)
VALUES (
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'Denver Trades Org',
    'denver-trades-org',
    ARRAY['Black Pepper', 'Coriander Seeds', 'Cashew Nuts', 'Robusta Coffee'],
    ARRAY['United Arab Emirates', 'Saudi Arabia', 'Germany', 'Netherlands'],
    true
) ON CONFLICT (id) DO NOTHING;

-- 2. Seed Mock Companies
INSERT INTO companies (id, org_id, name, type, hq_country, hq_city, origin_countries, destination_countries, products_dealt, website, description, contacts, is_enriched, confidence_score, created_at)
VALUES 
(
    'c0f0a884-c812-4d2d-8bde-d51352e463a1',
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'Al-Rashid Foodstuff Trading LLC',
    'Importer',
    'United Arab Emirates',
    'Dubai',
    ARRAY['Vietnam', 'India', 'Indonesia'],
    ARRAY['United Arab Emirates', 'Oman', 'Saudi Arabia'],
    ARRAY['Black Pepper 550 ASTA', 'White Pepper 600g/l', 'Cassia Split'],
    'https://www.alrashidfoodstuff.ae',
    'A leading importer and distributor of agricultural commodities, spices, and seeds across the GCC region, headquartered in Deira, Dubai.',
    '[{"name": "Youssef Al-Rashid", "role": "Head Procurement Officer", "phone": "+971 50 123 4567", "email": "youssef@alrashidfoodstuff.ae", "whatsapp_verified": true}]'::jsonb,
    true,
    0.98,
    NOW() - INTERVAL '10 days'
),
(
    'c0f0a884-c812-4d2d-8bde-d51352e463a2',
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'Gulf Spices & Seeds Industry',
    'Importer',
    'United Arab Emirates',
    'Sharjah',
    ARRAY['Vietnam', 'India', 'China'],
    ARRAY['United Arab Emirates', 'Bahrain'],
    ARRAY['Coriander Seeds', 'Cumin Seeds', 'Black Pepper'],
    'https://www.gulfspices.com',
    'Specialized processing and distribution unit of raw spices and oilseeds supplying local UAE consumer brands.',
    '[{"name": "Amit Sharma", "role": "Senior Buyer", "phone": "+971 6 555 7890", "email": "procurement@gulfspices.com", "whatsapp_verified": true}]'::jsonb,
    true,
    0.95,
    NOW() - INTERVAL '8 days'
),
(
    'c0f0a884-c812-4d2d-8bde-d51352e463a3',
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'EuroFoods Import GmbH',
    'Importer',
    'Germany',
    'Hamburg',
    ARRAY['Vietnam', 'Brazil', 'Indonesia'],
    ARRAY['Germany', 'Austria', 'Poland'],
    ARRAY['Jasmine Rice', 'Cashew Nuts WW320', 'Cloves'],
    'https://www.eurofoods.de',
    ' Hamburg-based importer specializing in organic and premium agricultural imports from South East Asia and South America.',
    '[{"name": "Marcus Wagner", "role": "Imports Director", "phone": "+49 40 882910", "email": "m.wagner@eurofoods.de", "whatsapp_verified": false}]'::jsonb,
    true,
    0.92,
    NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed Mock Shipments
INSERT INTO shipments (org_id, company_id, product, hs_code, port_loading, port_discharge, weight_kg, container_count, shipment_date, carrier, source_reference)
VALUES
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a1',
    'Black Pepper 550g/l ASTA',
    '09041130',
    'Cat Lai Port, VN',
    'Jebel Ali, UAE',
    32000,
    2,
    CURRENT_DATE - INTERVAL '15 days',
    'Maersk Line',
    'MSK93820182'
),
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a1',
    'White Pepper 600g/l washed',
    '09041140',
    'Bangkok, TH',
    'Jebel Ali, UAE',
    16000,
    1,
    CURRENT_DATE - INTERVAL '30 days',
    'ONE Line',
    'ONEL8271039'
),
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a2',
    'Coriander Seeds Split Grade A',
    '09092100',
    'Mundra Port, IN',
    'Sharjah Port, UAE',
    24000,
    1,
    CURRENT_DATE - INTERVAL '10 days',
    'CMA CGM',
    'CMA82739103'
),
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a3',
    'Cashew Nuts WW320 wholes',
    '08013220',
    'Ho Chi Minh Port, VN',
    'Hamburg, DE',
    15500,
    1,
    CURRENT_DATE - INTERVAL '22 days',
    'Hapag-Lloyd',
    'HPL82730193'
);

-- 4. Seed Mock Deals
INSERT INTO deals_pipeline (org_id, company_id, title, value_usd, quantity_mt, product, stage, incoterm, port_loading, port_discharge, payment_terms, expected_close_date)
VALUES
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a1',
    '32MT Black Pepper 550g/l ASTA',
    240000.00,
    32.000,
    'Black Pepper 550g/l ASTA',
    'Negotiation',
    'CIF',
    'Cat Lai Port, VN',
    'Jebel Ali, UAE',
    'Irrevocable L/C at sight',
    CURRENT_DATE + INTERVAL '12 days'
),
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a2',
    '24MT Coriander Seeds Bulk',
    85000.00,
    24.000,
    'Coriander Seeds',
    'Discovery',
    'FOB',
    'Mundra Port, IN',
    'Sharjah Port, UAE',
    '30% TT advance, 70% DP at sight',
    CURRENT_DATE + INTERVAL '25 days'
),
(
    'd3b07384-d113-4e4e-9c8e-5b123d456789',
    'c0f0a884-c812-4d2d-8bde-d51352e463a3',
    '15.5MT Cashew Nuts WW320',
    410000.00,
    15.500,
    'Cashew Nuts WW320',
    'Outreach',
    'CIF',
    'Ho Chi Minh Port, VN',
    'Hamburg, DE',
    'CAD (Cash Against Documents)',
    CURRENT_DATE + INTERVAL '30 days'
);

-- 5. Seed Commodity Price Feeds
INSERT INTO commodity_prices (commodity, origin_country, price_usd, unit, source)
VALUES
('Black Pepper 550g/l ASTA', 'Vietnam', 4850.00, 'MT', 'HCMC VPA Exchange'),
('White Pepper 630g/l', 'Indonesia', 6900.00, 'MT', 'IPC Jakarta'),
('Cashews WW320 Wholes', 'Vietnam', 7250.00, 'MT', 'VINACAS'),
('Robusta Coffee Screen 18', 'Vietnam', 3420.00, 'MT', 'Buon Ma Thuot Exchange'),
('Cassia Split A-Grade', 'Vietnam', 2800.00, 'MT', 'VPA Hanoi');
