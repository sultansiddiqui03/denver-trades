import { describe, it, expect } from 'vitest';
import { normalizeProductQuery, wasQueryNormalized } from './productQuery';

describe('normalizeProductQuery', () => {
  const cases: Array<[string, string]> = [
    // The reported failure: natural-language query → bare product.
    ['rice exporters in usa', 'rice'],
    ['rice importers', 'rice'],
    ['black pepper buyers', 'black pepper'],
    ['list of cumin suppliers india', 'cumin'],
    ['top basmati rice exporters', 'basmati rice'],
    ['find turmeric manufacturers in europe', 'turmeric'],
    ['sesame seeds wholesalers uae', 'sesame seeds'],
    // Already-clean products pass through.
    ['black pepper', 'black pepper'],
    ['cardamom', 'cardamom'],
    // Multi-word products preserved.
    ['green coffee beans', 'green coffee beans'],
  ];
  it.each(cases)('normalizeProductQuery(%j) === %j', (input, expected) => {
    expect(normalizeProductQuery(input)).toBe(expected);
  });

  it('falls back to the original when only stop/geo words remain (e.g. a company name typed as such)', () => {
    // All tokens are geo/role → nothing recognizable as a product → keep input.
    expect(normalizeProductQuery('USA')).toBe('USA');
    expect(normalizeProductQuery('exporters')).toBe('exporters');
  });

  it('flags whether a query was changed', () => {
    expect(wasQueryNormalized('rice exporters in usa')).toBe(true);
    expect(wasQueryNormalized('black pepper')).toBe(false);
  });
});
