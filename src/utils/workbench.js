import { isBossId } from '@/constants/options'

// Old projects without a recorded reviewer remain available to a project administrator.
export function canReviewDelivery(order, memberId) {
  const reviewer = order?.taskTurns?.delivery?.requesterId
  return isBossId(memberId) && (reviewer == null || String(reviewer) === String(memberId))
}

// 这个单子是否“需要我现在处理”
export function isMyTodo(order, memberId) {
  if (!order || ['done', 'cancelled'].includes(order.status)) return false
  if (order.nextStep && order.nextOwnerId === memberId) return true
  if (canReviewDelivery(order, memberId) && order.status === 'review') return true
  return order.ownerId === memberId && (order.assignState === 'pending' || Number(order.actionBugCount) > 0)
}

// 这个单子是否“我已交待，等对方”
export function isWaitingOther(order, memberId) {
  if (!order || ['done', 'cancelled'].includes(order.status)) return false
  if (isMyTodo(order, memberId)) return false
  if (order.ownerId === memberId) {
    return order.status === 'review' // 我提交了，等总管理员验收
  }
  // 总管理员在等负责人推进
  return isBossId(memberId) && ['pending', 'doing'].includes(order.status)
}

// 当前角色对这个单的“下一步一键动作”，没有则返回 null
export function nextAction(order, memberId) {
  if (!order || ['done', 'cancelled'].includes(order.status)) return null
  // 老板刚派过来、还没接收的项目：先接收（或拒绝），不能直接开工
  if (order.assignState === 'pending') return null
  if (canReviewDelivery(order, memberId) && order.status === 'review') {
    return { to: 'done', label: '验收通过' }
  }
  if (order.ownerId === memberId) {
    if (order.status === 'pending') return { to: 'doing', label: '开始做' }
    if (order.status === 'doing') {
      // 总管理员自己负责的项目没有别人来验收，做完直接完成；下属负责的才走「提交验收」
      if (order.taskTurns?.delivery?.returnedAt) return { to: 'review', label: '改好了，再提交验收' }
      return isBossId(memberId) ? { to: 'done', label: '完成' } : { to: 'review', label: '提交验收' }
    }
  }
  return null
}

// ---- 协作：下一步与停滞 ----
const pad = (n) => String(n).padStart(2, '0')
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// 下一步的截止状态：overdue 已过期 / today 今天到期 / null
export function nextDueState(order) {
  if (!order?.nextStep || !order.nextDue || ['done', 'cancelled'].includes(order.status)) return null
  const today = dayStr(new Date())
  if (order.nextDue < today) return 'overdue'
  if (order.nextDue === today) return 'today'
  return null
}
// 截止日期的短写法：今天 / 明天 / 11月8日
export function shortDue(d) {
  if (!d) return ''
  const now = new Date()
  if (d === dayStr(now)) return '今天'
  const t = new Date(now); t.setDate(t.getDate() + 1)
  if (d === dayStr(t)) return '明天'
  return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日'
}
// 待确认 / 进行中的项目多少天没有任何动静（没到停滞天数返回 0）
export function stalledDays(order, limit) {
  if (!order || !['pending', 'doing'].includes(order.status) || !order.updateTime) return 0
  const t = new Date(String(order.updateTime).replace(' ', 'T'))
  if (Number.isNaN(t.getTime())) return 0
  const days = Math.floor((Date.now() - t.getTime()) / 86400000)
  return days >= limit ? days : 0
}
// 待验收的项目多少天没有任何动静（没人验收、客户也没回话）。没到停滞天数返回 0。
// 只给卡片上的「N 天没动静」用；工作台「快被忘了」仍然只列待确认 / 进行中（待验收的已经在老板的待办里）
export function reviewIdleDays(order, limit) {
  if (!order || order.status !== 'review' || !order.updateTime) return 0
  const t = new Date(String(order.updateTime).replace(' ', 'T'))
  if (Number.isNaN(t.getTime())) return 0
  const days = Math.floor((Date.now() - t.getTime()) / 86400000)
  return days >= limit ? days : 0
}
