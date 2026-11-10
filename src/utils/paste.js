// 粘贴统一由这里分发（管理端和客户端共用）。
//
// 规则：鼠标停在哪个区域（带 data-paste-zone 的容器，如「客户沟通」「内部记录」「问题清单」、建单表单），
// Ctrl+V 就粘到哪个区域——
//   · 剪贴板是文字：填进这个区域的输入框（不用先点进输入框）；
//   · 剪贴板是图片 / 文件：传到这个区域的附件里。
// 鼠标不在任何区域上（或手机上没有鼠标）时，按光标所在的输入框处理：文字走浏览器原生粘贴，图片传到同一区域的附件。
// 剪贴板里同时有文字和图片时（从 Excel / Word 复制常这样），按文字处理；只有图片、或文字只是文件名时按文件处理。
import { nextTick } from 'vue'
import { toast as ElMessage } from '@/utils/toast'

const targets = []
const legacyScope = '.bug-form,.bug-update-form,.composer,.panel,.el-form,.el-dialog,.el-drawer,.intake-card'

// ---- 记住鼠标位置（只认真鼠标，触屏不算） ----
let pointer = null
function onPointerMove(e) {
  if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }
}
function onPointerLeave() {
  pointer = null
}
// 一直记着鼠标位置（被动监听，几乎没有开销），保证打开页面后第一次粘贴也知道鼠标在哪
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('mouseleave', onPointerLeave)
}

const isVisible = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
const zoneOf = (el) => (el && el.closest ? el.closest('[data-paste-zone]') : null)
function hoveredZone() {
  if (!pointer) return null
  return zoneOf(document.elementFromPoint(pointer.x, pointer.y))
}
function isEditable(el) {
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && /^(text|search|url|tel|email|number|password|)$/.test(el.type || '')
}
function usableField(el) {
  return isVisible(el) && !el.disabled && !el.readOnly
}
// 区域里的文字输入框：优先标了 data-paste-text 的，其次第一个多行输入框
function textFieldIn(zone) {
  const marked = [...zone.querySelectorAll('[data-paste-text] textarea, [data-paste-text] input, textarea[data-paste-text], input[data-paste-text]')]
  const own = (el) => zoneOf(el) === zone
  return marked.find((el) => own(el) && usableField(el)) || [...zone.querySelectorAll('textarea')].find((el) => own(el) && usableField(el)) || null
}
// 区域里的附件上传器（嵌套的子区域不算）
function uploaderIn(zone) {
  return targets.filter((t) => {
    const el = t.element()
    return isVisible(el) && zone.contains(el) && zoneOf(el) === zone
  }).at(-1) || null
}
// 没有区域可用时的老规则：光标所在的那块里的上传器，否则最后一个可见的上传器
function legacyUploader(eventTarget) {
  const visible = targets.filter((t) => isVisible(t.element()))
  const focused = visible.filter((t) => {
    const el = t.element()
    const scope = el.closest(legacyScope) || el.parentElement
    return scope?.contains(eventTarget)
  })
  return (focused.length ? focused : visible).at(-1) || null
}

function readClipboard(data) {
  const files = []
  for (const it of data.items || []) {
    if (it.kind === 'file') {
      const f = it.getAsFile()
      if (f) files.push(f)
    }
  }
  const text = data.getData('text/plain') || ''
  const t = text.trim()
  // 在访达里复制文件时，剪贴板的文字只是文件名：这种按文件处理
  const onlyNames = !!t && files.length > 0 && t.split(/\r?\n/).every((line) => files.some((f) => line.trim().endsWith(f.name)))
  if (files.length && (!t || onlyNames)) return { kind: 'files', files }
  if (t) return { kind: 'text', text }
  return null
}

function insertText(field, text) {
  const wasFocused = document.activeElement === field
  field.focus()
  const len = field.value.length
  const start = wasFocused ? field.selectionStart ?? len : len
  const end = wasFocused ? field.selectionEnd ?? len : len
  // 没点进输入框时接在已有内容后面，另起一行
  const glue = !wasFocused && len && field.tagName === 'TEXTAREA' && !field.value.endsWith('\n') ? '\n' : ''
  field.setRangeText(glue + text, start, end, 'end')
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

// 区域暂时没有输入框 / 上传器（比如 Bug 表单收着）：让它先展开
async function openZone(zone) {
  if (!zone.hasAttribute('data-paste-open')) return
  zone.dispatchEvent(new CustomEvent('paste-open'))
  await nextTick()
  await nextTick()
}

function tellRouted(zone, focusedZone) {
  // 光标在别的区域、内容却按鼠标位置粘到这里时，提示一下，免得以为粘错地方
  if (focusedZone && focusedZone !== zone) ElMessage.info({ message: `已粘贴到「${zone.dataset.pasteZone || '当前区域'}」`, duration: 1500 })
}

function onPaste(event) {
  if (event.defaultPrevented || !event.clipboardData) return
  const clip = readClipboard(event.clipboardData)
  if (!clip) return
  const focusedZone = zoneOf(event.target)
  const hovered = hoveredZone()
  // 鼠标指着另一个区域（或者光标不在任何区域里）时，以鼠标为准
  const byMouse = hovered && hovered !== focusedZone ? hovered : null

  if (clip.kind === 'text') {
    if (!byMouse) return // 光标在哪就粘在哪：交给浏览器
    event.preventDefault()
    ;(async () => {
      let field = textFieldIn(byMouse)
      if (!field) {
        await openZone(byMouse)
        field = textFieldIn(byMouse)
      }
      if (field) {
        insertText(field, clip.text)
        tellRouted(byMouse, focusedZone)
      }
    })()
    return
  }

  let zone = byMouse || focusedZone
  let target = zone ? uploaderIn(zone) : null
  const canOpen = !!zone && zone.hasAttribute('data-paste-open')
  if (!target && !canOpen) {
    // 这个区域没有附件位置：退回老规则（光标所在那块的上传器）
    target = legacyUploader(event.target)
    zone = null
    if (!target) return
  }
  event.preventDefault()
  ;(async () => {
    if (!target && zone) {
      await openZone(zone)
      target = uploaderIn(zone)
    }
    if (target) {
      target.addFiles(clip.files)
      if (zone && zone === byMouse) tellRouted(zone, focusedZone)
    }
  })()
}

export function registerPasteTarget(element, addFiles) {
  const target = { element, addFiles }
  if (!targets.length) window.addEventListener('paste', onPaste)
  targets.push(target)
  return () => {
    const index = targets.indexOf(target)
    if (index !== -1) targets.splice(index, 1)
    if (!targets.length) window.removeEventListener('paste', onPaste)
  }
}
