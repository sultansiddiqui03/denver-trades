import { describe, it, expect } from 'vitest';
import { evidenceToNote } from './evidenceNote';

describe('evidenceToNote', () => {
  it('renders a compact note from evidence fields', () => {
    const note = evidenceToNote({ product: 'black pepper', volume: 1888, origins: ['Vietnam', 'India'] });
    expect(note).toContain('Evidence —');
    expect(note).toContain('product: black pepper');
    expect(note).toContain('volume: 1888');
    expect(note).toContain('origins: Vietnam, India');
  });

  it('caps arrays and field count', () => {
    const note = evidenceToNote({ list: [1, 2, 3, 4, 5, 6, 7] });
    expect(note).toBe('Evidence — list: 1, 2, 3, 4, 5');
  });

  it('skips null/undefined values', () => {
    expect(evidenceToNote({ a: null, b: undefined, c: 'x' })).toBe('Evidence — c: x');
  });

  it('returns null for empty / non-object evidence', () => {
    expect(evidenceToNote(null)).toBeNull();
    expect(evidenceToNote({})).toBeNull();
    expect(evidenceToNote('nope')).toBeNull();
    expect(evidenceToNote({ a: null })).toBeNull();
  });
});
