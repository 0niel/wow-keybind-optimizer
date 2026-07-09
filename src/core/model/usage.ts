export const MAINTENANCE_AURA_MIN_MS = 30 * 60 * 1000

export function isMaintenanceAura(durationMs: number | undefined): boolean {
  return durationMs !== undefined && durationMs >= MAINTENANCE_AURA_MIN_MS
}
