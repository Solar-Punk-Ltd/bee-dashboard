import { Point, Dir } from './common'

export function computeContextMenuPosition(args: {
  clickPos: Point
  menuRect: DOMRect
  viewport: { w: number; h: number }
  margin?: number
  containerRect?: DOMRect | null
}): { safePos: Point; dropDir: Dir } {
  const { clickPos: pos, menuRect: rect, viewport, containerRect } = args
  const margin = args.margin ?? 8
  const left = Math.max(margin, Math.min(pos.x, viewport.w - rect.width - margin))
  const vh = viewport.h
  let top = pos.y
  let dir: Dir = Dir.Down
  const midY = containerRect ? containerRect.top + containerRect.height / 2 : viewport.h * 0.5

  if (pos.y > midY || pos.y + rect.height + margin > vh) {
    top = Math.max(margin, pos.y - rect.height)
    dir = Dir.Up
  } else {
    top = Math.max(margin, Math.min(pos.y, vh - rect.height - margin))
  }

  return { safePos: { x: left, y: top }, dropDir: dir }
}
