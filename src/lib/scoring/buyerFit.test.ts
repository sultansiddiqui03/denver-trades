import { describe, it, expect } from 'vitest';
import {
  scoreBuyerFit,
  matchesOrgCommodity,
  buyerFitTier,
  BUYER_FIT_WEIGHTS,
  type BuyerFitCompany,
  type BuyerFitOrg,
} from './buyerFit';

const DAY = 24 * 60 * 60 * 1000;
// A date inside the "active in the last quarter" window → recency sub-score 1.
const recentIso = () => new Date(Date.now() - 10 * DAY).toISOString();

describe('BUYER_FIT_WEIGHTS', () => {
  it('sums to 100 so a perfect company maps to a 100 score', () => {
    const total = Object.values(BUYER_FIT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe('matchesOrgCommodity', () => {
  // The taxonomy is the load-bearing piece: a generic org category like
  // "spices" must match a specific customs product like "Black Pepper 550 ASTA",
  // while staying disjoint across categories (coffee !== spices).
  const cases: Array<[string, string[], boolean]> = [
    ['Black Pepper 550 ASTA', ['spices'], true],
    ['Cardamom Whole', ['spices'], true],
    ['Basmati Rice', ['grains'], true],
    ['Green Coffee Arabica', ['coffee'], true],
    // direct loose containment, either direction
    ['pepper', ['black pepper'], true],
    ['Turmeric Powder', ['turmeric'], true],
    // cross-category negatives — the documented "coffee excluded for a spice org"
    ['Green Coffee Arabica', ['spices'], false],
    ['Black Pepper', ['coffee'], false],
    ['Steel Pipes', ['spices'], false],
    // empty product guard
    ['', ['spices'], false],
  ];
  it.each(cases)('matchesOrgCommodity(%j, %j) === %s', (product, commodities, expected) => {
    expect(matchesOrgCommodity(product, commodities)).toBe(expected);
  });
});

describe('scoreBuyerFit', () => {
  it('scores a perfect buyer at 100 with every sub-score maxed', () => {
    const company: BuyerFitCompany = {
      type: 'Importer',
      products_dealt: ['Black Pepper 550 ASTA'],
      total_shipments: 1000,
      last_shipment_date: recentIso(),
      hq_country: 'United Arab Emirates',
    };
    const org: BuyerFitOrg = { commodities: ['spices'], target_markets: ['UAE'] };
    const { score, breakdown } = scoreBuyerFit(company, org);
    expect(breakdown).toEqual({
      commodityMatch: 1,
      shipmentVolume: 1,
      recency: 1,
      tradeDirection: 1,
      marketFit: 1,
    });
    expect(score).toBe(100);
  });

  it('excludes an off-commodity exporter and ranks it below a matching buyer', () => {
    const company: BuyerFitCompany = {
      type: 'Exporter',
      products_dealt: ['Green Coffee Arabica'],
      total_shipments: 500,
      last_shipment_date: null,
      hq_country: 'Brazil',
    };
    const org: BuyerFitOrg = { commodities: ['spices'], target_markets: ['UAE'] };
    const { score, breakdown } = scoreBuyerFit(company, org);
    expect(breakdown.commodityMatch).toBe(0);
    expect(buyerFitTier(score)).toBe('cool');

    const matching = scoreBuyerFit(
      { ...company, type: 'Importer', products_dealt: ['Black Pepper'] },
      org,
    );
    expect(matching.score).toBeGreaterThan(score);
  });

  it('stays neutral when the org has not declared commodities or markets', () => {
    const company: BuyerFitCompany = {
      type: 'Importer',
      products_dealt: ['Anything'],
      total_shipments: 1000,
      last_shipment_date: recentIso(),
    };
    const { score, breakdown } = scoreBuyerFit(company, {});
    expect(breakdown.commodityMatch).toBe(0.5);
    expect(breakdown.marketFit).toBe(0.5);
    expect(score).toBe(75); // 0.5*40 + 1*25 + 1*15 + 1*10 + 0.5*10
  });

  it('degrades gracefully with no customs data — finite, low, never throws', () => {
    const { score } = scoreBuyerFit(
      { type: null },
      { commodities: ['spices'], target_markets: ['UAE'] },
    );
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(11); // 0.1*40 + 0 + 0 + 0.5*10 + 0.2*10
  });

  it('rewards an importer over an exporter, all else equal', () => {
    const base: BuyerFitCompany = {
      products_dealt: ['Black Pepper'],
      total_shipments: 100,
      last_shipment_date: recentIso(),
      hq_country: 'United Arab Emirates',
    };
    const org: BuyerFitOrg = { commodities: ['spices'], target_markets: ['UAE'] };
    const importer = scoreBuyerFit({ ...base, type: 'Importer' }, org).score;
    const exporter = scoreBuyerFit({ ...base, type: 'Exporter' }, org).score;
    expect(importer).toBeGreaterThan(exporter);
  });
});

describe('buyerFitTier', () => {
  it.each([
    [100, 'hot'],
    [70, 'hot'],
    [69, 'warm'],
    [40, 'warm'],
    [39, 'cool'],
    [0, 'cool'],
  ] as const)('buyerFitTier(%i) === %s', (score, tier) => {
    expect(buyerFitTier(score)).toBe(tier);
  });
});
