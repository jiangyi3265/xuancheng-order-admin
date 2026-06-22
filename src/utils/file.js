// 附件类型 / 大小 / 图标 / 下载 工具

export function attType(mime, name = '') {
  if (mime && mime.startsWith('image/')) return 'image'
  if (mime && mime.startsWith('video/')) return 'video'
  const ext = extOf(name)
  if (['mp4', 'mov', 'webm', 'avi', 'm4v', 'mkv'].includes(ext)) return 'video'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image'
  return 'file'
}

export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

export function fmtSize(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

// 返回 Element Plus 图标组件名（已全局注册，可 <component :is>）
export function fileIcon(name) {
  const ext = extOf(name)
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'Box'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Grid'
  if (['ppt', 'pptx'].includes(ext)) return 'Postcard'
  if (['doc', 'docx', 'pdf', 'txt', 'md', 'rtf'].includes(ext)) return 'Document'
  return 'Files'
}

export function downloadAttachment(item) {
  if (!item || !item.url) return
  const a = document.createElement('a')
  a.href = item.url
  a.download = item.name || 'file'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
