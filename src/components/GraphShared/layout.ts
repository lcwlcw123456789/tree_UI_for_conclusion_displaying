export type PillarRegion = {
  key: string
  title: string
  x: number
  y: number
  width: number
  height: number
  innerLeft: number
  innerRight: number
  innerTop: number
  innerBottom: number
}

export function buildPillarRegions(
  pillars: Array<{ key: string; title: string }>,
  width: number,
  height: number,
  options?: {
    pad?: number
    gap?: number
    top?: number
    bottom?: number
    headerSpace?: number
    innerPadX?: number
    innerPadBottom?: number
  },
): PillarRegion[] {
  if (!pillars.length) return []

  const pad = options?.pad ?? 12
  const gap = options?.gap ?? 12
  const top = options?.top ?? 52
  const bottom = options?.bottom ?? 14
  const headerSpace = options?.headerSpace ?? 48
  const innerPadX = options?.innerPadX ?? 16
  const innerPadBottom = options?.innerPadBottom ?? 14

  const safeW = Math.max(width, 320)
  const safeH = Math.max(height, 220)
  const total = pillars.length
  const regionWidth = (safeW - pad * 2 - gap * (total - 1)) / total
  const regionHeight = Math.max(safeH - top - bottom, 120)

  return pillars.map((p, i) => {
    const x = pad + i * (regionWidth + gap)
    const y = top
    return {
      key: p.key,
      title: p.title,
      x,
      y,
      width: regionWidth,
      height: regionHeight,
      innerLeft: x + innerPadX,
      innerRight: x + regionWidth - innerPadX,
      innerTop: y + headerSpace,
      innerBottom: y + regionHeight - innerPadBottom,
    }
  })
}
