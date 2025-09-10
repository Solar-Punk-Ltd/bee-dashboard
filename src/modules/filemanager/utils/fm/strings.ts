export const toStr = (x: unknown): string => {
  try {
    return (x as { toString?: () => string })?.toString?.() ?? String(x ?? '')
  } catch {
    return String(x ?? '')
  }
}
export const safeStr = (x: unknown): string => {
  try {
    const s = (x as { toString?: () => string })?.toString?.() ?? String(x ?? '')

    return s !== '[object Object]' ? s : ''
  } catch {
    return ''
  }
}
export const sanitizeFileName = (s: string) => (s || 'download').replace(/[\\/:*?"<>|]+/g, '_')
export const normTopic = (x: unknown) => toStr(x)
