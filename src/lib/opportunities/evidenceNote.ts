/**
 * Render an opportunity's `evidence` jsonb into a short, human-readable note
 * for the deal that gets created when the opportunity is acted on. Pure +
 * defensive about shape so it can be unit-tested and never throws on odd input.
 */
export function evidenceToNote(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const e = evidence as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (v == null) continue;
    const val = Array.isArray(v) ? v.slice(0, 5).join(', ') : String(v);
    if (val) parts.push(`${k}: ${val}`);
  }
  return parts.length ? `Evidence — ${parts.slice(0, 6).join(' · ')}` : null;
}
