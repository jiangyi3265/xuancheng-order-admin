import { customerName } from '@/mock/store'

const minute = time => String(time || '').replace('T', ' ').slice(0, 16)

function readReceipt(id) {
  try {
    const account = localStorage.getItem('customerAccount') || customerName.value
    const key = 'xc.seen.v2.' + JSON.stringify([account, String(id)])
    const saved = JSON.parse(localStorage.getItem(key))
    const legacy = localStorage.getItem('xc.seen.' + customerName.value + '.' + id)
    return { key, time: saved?.time ?? legacy ?? '', messageId: Number(saved?.messageId) || 0 }
  } catch {
    return { time: '', messageId: 0 }
  }
}

function newer(message, receipt) {
  // Older receipts and older API responses only have a minute-level timestamp.
  if (message.id && receipt.messageId) return Number(message.id) > receipt.messageId
  return minute(message.time) > receipt.time
}

export function markSeen(id, message) {
  if (!id || !message?.time) return
  const receipt = readReceipt(id)
  const time = minute(message.time)
  if (!receipt.key || !(newer(message, receipt) || (!receipt.messageId && message.id && time === receipt.time))) return
  try {
    localStorage.setItem(receipt.key, JSON.stringify({ time, messageId: Number(message.id) || 0 }))
  } catch { /* Reading messages still works when browser storage is unavailable. */ }
}

export function hasNewReply(order) {
  const last = order?.lastMessage
  return !!last && last.type === 'reply' && newer(last, readReceipt(order.id))
}
