// 让整张图完整显示的缩放比例
export function getFitScale(
  naturalWidth: number,
  naturalHeight: number,
  viewportWidth: number,
  viewportHeight: number
): number {
  if (!naturalWidth || !naturalHeight) return 1
  return Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight)
}

// 按步进缩放并夹在上下限之间
export function computeNextScale(
  currentScale: number,
  zoomIn: boolean,
  ratio: number,
  min: number,
  max: number
): number {
  const multiplier = zoomIn ? 1 + ratio : 1 - ratio
  return Math.min(max, Math.max(min, currentScale * multiplier))
}

// 换图后把平移量限制在图片边界内
export function clampTranslation(value: number, viewportSize: number, scaledSize: number): number {
  const overflow = Math.max(0, (scaledSize - viewportSize) / 2)
  return Math.min(overflow, Math.max(-overflow, value))
}
