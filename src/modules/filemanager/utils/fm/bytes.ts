export function formatBytes(v?: string | number): string {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN

  if (!Number.isFinite(n) || n < 0) return '—'

  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB'] as const
  let val = n / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }

  return `${val.toFixed(1)} ${units[i]}`
}
