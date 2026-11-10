import { todayStr, dateAfterDays } from './date'

export function fmtTime(t) {
  return t ? String(t).replace('T', ' ').slice(0, 16) : ''
}

export function dayLabel(time) {
  const day = fmtTime(time).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const today = todayStr()
  if (day === today) return '今天'
  if (day === dateAfterDays(-1)) return '昨天'
  const [year, month, date] = day.split('-')
  return (year === today.slice(0, 4) ? '' : year + '年') + Number(month) + '月' + Number(date) + '日'
}

export function friendlyTime(time) {
  const full = fmtTime(time)
  const day = dayLabel(full)
  if (!day) return full
  const showClock = day === '昨天' || full.slice(0, 4) === todayStr().slice(0, 4)
  return [day, showClock ? full.slice(11) : ''].filter(Boolean).join(' ')
}
