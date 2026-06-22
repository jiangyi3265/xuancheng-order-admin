import { BOSS_ID } from '@/constants/options'

// 判定逻辑基于“谁是负责人(做事的人)”+ 状态 + 未读：
// - 我是负责人：待确认/进行中 → 我要做；待验收 → 等老板验
// - 我不是负责人：老板对别人提交的「待验收」需要验收

// 这个单子是否“需要我现在处理”
export function isMyTodo(order, memberId) {
  if (!order || ['done', 'cancelled'].includes(order.status)) return false
  // 对方留了新动态没看 —— 永远算待办（解决“微信顶没了/忘了说”）
  if (order.unread?.includes(memberId)) return true
  if (order.ownerId === memberId) {
    return ['pending', 'doing'].includes(order.status)
  }
  // 老板验收别人提交的单
  return memberId === BOSS_ID && order.status === 'review'
}

// 这个单子是否“我已交待，等对方”
export function isWaitingOther(order, memberId) {
  if (!order || ['done', 'cancelled'].includes(order.status)) return false
  if (isMyTodo(order, memberId)) return false
  if (order.ownerId === memberId) {
    return order.status === 'review' // 我提交了，等老板验收
  }
  // 老板在等负责人推进
  return memberId === BOSS_ID && ['pending', 'doing'].includes(order.status)
}

// 当前角色对这个单的“下一步一键动作”，没有则返回 null
export function nextAction(order, memberId) {
  if (!order || ['done', 'cancelled'].includes(order.status)) return null
  if (order.ownerId === memberId) {
    if (order.status === 'pending') return { to: 'doing', label: '开始做' }
    if (order.status === 'doing') return { to: 'review', label: '提交验收' }
    return null
  }
  if (memberId === BOSS_ID && order.status === 'review') {
    return { to: 'done', label: '验收通过' }
  }
  return null
}
