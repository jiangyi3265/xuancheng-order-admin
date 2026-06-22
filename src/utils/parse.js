// 从客户粘贴的文本里智能抽取「报价金额」「截止日期」，减少手填
import { dateAfterDays } from '@/utils/date'

export function parseOrderHints(text) {
  const t = text || ''
  return { amount: parseAmount(t), deadline: parseDeadline(t) }
}

function parseAmount(t) {
  // 预算/报价/价格 5000；¥5000；5000元/块；3.5万/3w
  const wan = t.match(/(\d+(?:\.\d+)?)\s*[wW万]/)
  if (wan) return Math.round(parseFloat(wan[1]) * 10000)
  const labeled = t.match(/(?:预算|报价|价格|费用|价钱)\s*[:：]?\s*¥?\s*(\d{2,7})/)
  if (labeled) return parseInt(labeled[1])
  const yen = t.match(/¥\s*(\d{2,7})/)
  if (yen) return parseInt(yen[1])
  const yuan = t.match(/(\d{2,7})\s*(?:元|块钱|块)/)
  if (yuan) return parseInt(yuan[1])
  return null
}

function parseDeadline(t) {
  // 明确日期 2026-07-01 / 7月1日
  const iso = t.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`
  const md = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
  if (md) {
    const now = new Date()
    let y = now.getFullYear()
    const mm = parseInt(md[1]), dd = parseInt(md[2])
    const cand = new Date(y, mm - 1, dd)
    if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1
    return `${y}-${pad(mm)}-${pad(dd)}`
  }
  // 相对：今天/明天/后天/大后天
  if (/大后天/.test(t)) return dateAfterDays(3)
  if (/后天/.test(t)) return dateAfterDays(2)
  if (/明天/.test(t)) return dateAfterDays(1)
  if (/今天|今日/.test(t)) return dateAfterDays(0)
  // N天内/后
  const nDay = t.match(/(\d{1,3})\s*(?:个)?\s*(?:工作日|天|日)\s*(?:内|后|之内)?/)
  if (nDay) return dateAfterDays(parseInt(nDay[1]))
  // 一/两/三周
  const weekCn = t.match(/([一二三两1-9])\s*(?:个)?\s*(?:周|星期|礼拜)/)
  if (weekCn) {
    const map = { 一: 1, 二: 2, 两: 2, 三: 3 }
    const n = map[weekCn[1]] || parseInt(weekCn[1]) || 1
    return dateAfterDays(n * 7)
  }
  if (/本周|这周/.test(t)) return dateAfterDays(weekendOffset())
  if (/下周/.test(t)) return dateAfterDays(weekendOffset() + 7)
  return null
}

function weekendOffset() {
  const day = new Date().getDay() // 0 周日
  return (6 - day + 7) % 7 || 6 // 到本周六
}

function pad(n) {
  return String(n).padStart(2, '0')
}
