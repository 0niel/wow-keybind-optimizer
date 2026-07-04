export function normalizeSpellName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’:,()!]/g, '')
    .replace(/[\s-]+/g, '_')
    .trim()
}
