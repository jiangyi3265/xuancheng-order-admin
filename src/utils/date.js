// 本地日期 YYYY-MM-DD（与订单截止日期口径一致，避免用 UTC 的 toISOString 差一天）
export function todayStr() {
  return fmt(new Date())
}

// 今天 +n 天的本地日期字符串
export function dateAfterDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return fmt(d)
}

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
