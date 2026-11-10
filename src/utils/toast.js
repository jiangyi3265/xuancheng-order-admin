import { ElMessage } from 'element-plus'

const active = new Map()
const limit = 3
let waitingWarning

function showWaitingWarning() {
  if (!waitingWarning || active.size >= limit) return
  const pending = waitingWarning
  waitingWarning = undefined
  show(pending.type, pending.value)
}

function show(type, value) {
  const { actionable, ...options } = typeof value === 'string' ? { message: value } : value
  const duplicate = [...active.values()].some(item => item.message === options.message)
  if (!duplicate && active.size >= limit) {
    if (!actionable && type !== 'warning' && type !== 'error') return { close() {} }
    // Keep undo actions available when a routine status message can make room instead.
    const ordinary = [...active.keys()].find(handle => !active.get(handle).actionable)
    if (!actionable && !ordinary) {
      waitingWarning = { type, value }
      return { close() {} }
    }
    const oldest = ordinary || active.keys().next().value
    active.delete(oldest)
    oldest.close()
  }
  const handle = ElMessage({
    type, duration: type === 'success' ? 2000 : 4000, ...options,
    onClose() {
      active.delete(handle)
      options.onClose?.()
      showWaitingWarning()
    }
  })
  active.set(handle, { message: options.message, actionable })
  return handle
}

export const toast = Object.assign(
  value => show(value?.type || 'info', value),
  Object.fromEntries(['success', 'warning', 'error', 'info', 'primary'].map(type => [type, value => show(type, value)]))
)
