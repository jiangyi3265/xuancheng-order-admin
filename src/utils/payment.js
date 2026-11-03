// 收款相关的小工具。口径与后端一致：
//   已收清 = 收到过钱，并且不少于报价；没收清 = 报价大于已收；部分已收 = 收了一些但没收清。
const n = (v) => Number(v) || 0

export const PAY_STATE = {
  none: { label: '未收', type: 'danger' },
  part: { label: '部分已收', type: 'warning' },
  full: { label: '已收清', type: 'success' },
  free: { label: '未报价', type: 'info' }
}

// 还欠多少（报价 - 已收，最少 0）
export function owed(o) {
  return Math.max(n(o?.amount) - n(o?.receivedAmount), 0)
}

// none 一分没收 / part 部分已收 / full 已收清 / free 还没报价
export function payState(o) {
  const a = n(o?.amount)
  const r = n(o?.receivedAmount)
  if (r > 0 && r >= a) return 'full'
  if (r > 0) return 'part'
  return a > 0 ? 'none' : 'free'
}

// 列表筛选：'' 不筛 / '1' 已收清 / '0' 还欠款 / 'part' 部分已收（与服务端导出的筛选一致）
export function payFilterOk(o, filter) {
  if (!filter) return true
  if (filter === '1') return payState(o) === 'full'
  if (filter === '0') return owed(o) > 0
  if (filter === 'part') return payState(o) === 'part'
  return true
}

// ¥1,234.5 ；整数不带小数
export function money(v) {
  return '¥' + n(v).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
