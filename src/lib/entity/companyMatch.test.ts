import { describe, it, expect } from 'vitest';
import { normalizeCoreName, levenshtein, fuzzySameName } from './companyMatch';

describe('normalizeCoreName', () => {
  const cases: Array<[string, string]> = [
    ['McIlhenny', 'mcilhenny'],
    ['Mcilhenny Co', 'mcilhenny'],
    ['MCILHENNY INC', 'mcilhenny'],
    ['Kalustyan Corporation', 'kalustyan'],
    ['Lt Foods Americas', 'lt americas'], // "foods" is a stripped suffix
    ['Olam International Pvt Ltd', 'olam'],
    ['  Acme   Spice   Trading  ', 'acme spice'],
  ];
  it.each(cases)('normalizeCoreName(%j) === %j', (input, expected) => {
    expect(normalizeCoreName(input)).toBe(expected);
  });
});

describe('levenshtein', () => {
  it.each([
    ['', '', 0],
    ['a', '', 1],
    ['mcilhenny', 'mcllhenny', 1],
    ['waterglider', 'waterglinder', 1],
    ['kitten', 'sitting', 3],
  ] as const)('levenshtein(%j, %j) === %i', (a, b, d) => {
    expect(levenshtein(a, b)).toBe(d);
  });
});

describe('fuzzySameName', () => {
  // SHOULD merge — OCR/spelling variants of the same company.
  it.each([
    ['Mcilhenny', 'Mcllhenny'],
    ['Waterglider', 'Waterglinder International'],
    ['Kalustyan', 'Kalustyan Corporation'],
    ['McCormick', 'Mc Cormick Inc'],
  ] as const)('treats %j and %j as the same company', (a, b) => {
    expect(fuzzySameName(a, b)).toBe(true);
  });

  // SHOULD NOT merge — genuinely different companies (guards against over-merge
  // that would collapse distinct buyers into one and corrupt the directory).
  it.each([
    ['Olam', 'Otis McAllister'],
    ['Viet Pepper', 'King Pepper Products'],
    ['Sun Lee', 'Sela Pepper'],
    ['Best Food Services', 'Southeastern Food Supplies'],
    ['Cat', 'Dog'], // too short to fuzzy-merge
  ] as const)('keeps %j and %j distinct', (a, b) => {
    expect(fuzzySameName(a, b)).toBe(false);
  });

  it('returns false for empty / suffix-only names', () => {
    expect(fuzzySameName('', 'Olam')).toBe(false);
    expect(fuzzySameName('Inc', 'Ltd')).toBe(false);
  });
});
