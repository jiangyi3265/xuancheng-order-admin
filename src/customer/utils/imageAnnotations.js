export const ink = '#e52d43'

// Both the SVG preview and the exported canvas use this path in the source
// image coordinate system. Scrolling, fitting and zooming only change display.
export function annotationPath({tool, start, end, weight}) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (tool === 'ellipse') {
    const rx = Math.abs(dx) / 2
    const ry = Math.abs(dy) / 2
    const left = Math.min(start.x, end.x)
    const right = Math.max(start.x, end.x)
    const cy = (start.y + end.y) / 2
    if (!rx || !ry) return ''
    return `M ${left} ${cy} A ${rx} ${ry} 0 1 1 ${right} ${cy} A ${rx} ${ry} 0 1 1 ${left} ${cy} Z`
  }
  const length = Math.hypot(dx, dy)
  if (!length) return ''
  const head = Math.min(length * .42, weight * 4.8)
  const vx = dx / length * head, vy = dy / length * head
  const baseX = end.x - vx, baseY = end.y - vy
  return `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${baseX - vy * .53} ${baseY + vx * .53} L ${end.x} ${end.y} L ${baseX + vy * .53} ${baseY - vx * .53}`
}

export async function renderAnnotationFile(image, marks, name = '') {
  const width = image.naturalWidth, height = image.naturalHeight
  if (!width || !height) throw new Error('原图还未加载完成')
  // Bound allocation on mobile WebKit, while retaining the full aspect ratio.
  const scale = Math.min(1, 16384 / Math.max(width, height), Math.sqrt(16000000 / (width * height)))
  const canvas = document.createElement('canvas')
  try {
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器暂时无法保存圈注，请重新打开图片')
    ctx.scale(canvas.width / width, canvas.height / height)
    ctx.drawImage(image, 0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const mark of marks) {
      const path = new Path2D(annotationPath(mark))
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = mark.weight * 1.55
      ctx.stroke(path)
      ctx.strokeStyle = ink
      ctx.lineWidth = mark.weight
      ctx.stroke(path)
    }
    const jpeg = /\.jpe?g$/i.test(name)
    const encode = type => new Promise(resolve => canvas.toBlob(resolve, type, .94))
    let blob = await encode(jpeg ? 'image/jpeg' : 'image/png')
    if (blob && blob.size > 50 * 1024 * 1024) blob = await encode('image/webp')
    if (!blob || !blob.size || blob.size > 50 * 1024 * 1024) throw new Error('图片过大，暂时无法保存圈注')
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
    const stem = (name || '截图').replace(/\.[^.]+$/, '').replace(/-圈注$/, '')
    return new File([blob], stem + '-圈注.' + ext, {type:blob.type})
  } finally {
    canvas.width = canvas.height = 1
  }
}
