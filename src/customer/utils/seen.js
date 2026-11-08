// 客户「团队有新回复」的小红点：记下每个项目最后看过的沟通时间（存在本机，按客户账号分开）。
// 比较到分钟，避免列表和详情的时间格式（带不带秒）不一致导致红点一直不灭。
import { customerName } from '@/mock/store'

const key = (id) => 'xc.seen.' + (customerName.value || '') + '.' + id
const minute = (t) => String(t || '').replace('T', ' ').slice(0, 16)

export function seenAt(id) {
  try {
    return localStorage.getItem(key(id)) || ''
  } catch {
    return ''
  }
}

export function markSeen(id, time) {
  if (!id || !time) return
  try {
    if (minute(time) > seenAt(id)) localStorage.setItem(key(id), minute(time))
  } catch {
    // 存不了就算了，最多红点多亮一会儿
  }
}

// 列表里用：最后一条沟通是团队发的、并且比上次看过的新
export function hasNewReply(order) {
  const last = order?.lastMessage
  return !!last && last.type === 'reply' && minute(last.time) > seenAt(order.id)
}
