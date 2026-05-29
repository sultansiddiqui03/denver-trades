import { describe, it, expect } from 'vitest';
import {
  supplierDealsCommodity,
  isJunkBuyerName,
  resolveTargetChapters,
} from './buyerDiscovery';
import type { ScrapedHsCode } from './apifyReplay';

const hs = (code: string, shipments: number): ScrapedHsCode => ({ code, shipments });

describe('supplierDealsCommodity (HS-chapter dominance)', () => {
  const spices = new Set(['09']);

  it('keeps a supplier whose target chapter is the TOP chapter (Viet Pepper)', () => {
    expect(supplierDealsCommodity([hs('0904', 80), hs('20', 10)], spices)).toBe(true);
  });

  it('keeps when the target chapter is ≥25% of shipments even if not the top', () => {
    expect(supplierDealsCommodity([hs('84', 60), hs('09', 40)], spices)).toBe(true); // 40%
  });

  it('drops an off-commodity supplier with only an INCIDENTAL target shipment (Black&Decker)', () => {
    expect(supplierDealsCommodity([hs('84', 1000), hs('09', 5)], spices)).toBe(false); // 0.5%
  });

  it('drops a name-only match with no target chapter at all (King Pepper = sauces)', () => {
    expect(supplierDealsCommodity([hs('21', 30), hs('11', 12)], spices)).toBe(false);
  });

  it('stays permissive when there is no chapter signal to filter on', () => {
    expect(supplierDealsCommodity([hs('84', 100)], new Set())).toBe(true);
  });

  it('drops when there are no HS codes but a chapter filter is set', () => {
    expect(supplierDealsCommodity([], spices)).toBe(false);
    expect(supplierDealsCommodity(undefined, spices)).toBe(false);
  });
});

describe('isJunkBuyerName', () => {
  it.each([
    'Shipper',
    'Consignee',
    'To Order',
    'Missing in source document',
    'N A Trade',
    'NA',
    'AB', // too short
    'Unknown',
  ])('flags %j as junk', (name) => {
    expect(isJunkBuyerName(name)).toBe(true);
  });

  it.each(['Otis McAllister', 'Kalustyan', 'Lt Foods Americas', 'Best Food Services'])(
    'keeps real name %j',
    (name) => {
      expect(isJunkBuyerName(name)).toBe(false);
    },
  );
});

describe('resolveTargetChapters', () => {
  it('maps a product term to its customs chapter', () => {
    expect(resolveTargetChapters('black pepper', [])).toEqual(['09']);
    expect(resolveTargetChapters('rice', []).sort()).toEqual(['10', '11']);
    expect(resolveTargetChapters('sesame', []).sort()).toEqual(['12']);
  });

  it('maps org commodities to chapters when the product term is generic', () => {
    expect(resolveTargetChapters('', ['spices']).sort()).toEqual(['09']);
  });

  it('unions + dedupes product and commodity chapters', () => {
    expect(resolveTargetChapters('sesame', ['oilseeds'])).toEqual(['12']);
    expect(resolveTargetChapters('black pepper', ['spices', 'grains', 'oilseeds']).sort()).toEqual([
      '09',
      '10',
      '11',
      '12',
    ]);
  });

  it('returns no chapters for an unmapped product (stays permissive downstream)', () => {
    expect(resolveTargetChapters('widgets', [])).toEqual([]);
  });
});
