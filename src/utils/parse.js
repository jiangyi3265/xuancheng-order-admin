// 从客户粘贴的文本里智能抽取「报价金额」「截止日期」「客户称呼」「联系方式」，减少手填
// 注意：不用正则的「向后查找」(?<=)(?<!)，老款 iPhone 微信里的浏览器不认，整页会打不开
import { dateAfterDays } from '@/utils/date'

export function parseOrderHints(text) {
  const t = text || ''
  return { amount: parseAmount(t), deadline: parseDeadline(t), customer: parseCustomer(t), contact: parseContact(t) }
}

function parseAmount(t) {
  // 预算/报价/价格 5000；¥5000；5000元/块；3.5万/3w
  const wan = t.match(/(\d+(?:\.\d+)?)\s*(?:万|[wW](?![A-Za-z]))/)
  if (wan) return Math.round(parseFloat(wan[1]) * 10000)
  const labeled = t.match(/(?:预算|报价|价格|费用|价钱)\s*[:：]?\s*¥?\s*(\d{2,7})/)
  if (labeled) return parseInt(labeled[1])
  const yen = t.match(/¥\s*(\d{2,7})/)
  if (yen) return parseInt(yen[1])
  const yuan = t.match(/(\d{2,7})\s*(?:元|块钱|块)/)
  if (yuan) return parseInt(yuan[1])
  return null
}

const WEEKDAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }

// 「下周五」「周三前」「这周六」：按星期几算到具体哪一天（一周从周一算起）
function weekdayDate(t) {
  const m = t.match(/(下下|下|这|本)?\s*(?:个)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/)
  if (!m) return null
  const today = new Date().getDay() || 7 // 1 周一 … 7 周日
  let offset = (1 - today) + (WEEKDAY[m[2]] - 1) // 本周的那一天
  if (m[1] === '下') offset += 7
  else if (m[1] === '下下') offset += 14
  else if (!m[1] && offset < 0) offset += 7 // 只说「周三」而本周三已经过了：算下周三
  return dateAfterDays(offset)
}

function lastDayOfMonth(addMonths) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + addMonths + 1, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
  // 周几：下周五 / 周三前
  const wd = weekdayDate(t)
  if (wd) return wd
  // 周末：本周六（下周末 = 下周六）
  const weekend = t.match(/(下下|下)?\s*(?:个)?\s*周末/)
  if (weekend) return weekdayDate((weekend[1] || '') + '周六')
  // 月底 / 下个月底
  const monthEnd = t.match(/(下个?)?月底/)
  if (monthEnd) return lastDayOfMonth(monthEnd[1] ? 1 : 0)
  // 「15号前」：这个月的 15 号，已经过了就算下个月
  const dom = t.match(/(?:^|[^\d])(\d{1,2})\s*[号日]\s*(?:前|之前|以前|左右)/)
  if (dom) {
    const dd = parseInt(dom[1])
    if (dd >= 1 && dd <= 31) {
      const now = new Date()
      let y = now.getFullYear(), mm = now.getMonth() + 1
      if (dd < now.getDate()) { mm += 1; if (mm > 12) { mm = 1; y += 1 } }
      return `${y}-${pad(mm)}-${pad(dd)}`
    }
  }
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

// 这些词后面跟冒号的是字段名，不是客户称呼
const LABELS = /^(需求|预算|报价|价格|费用|时间|工期|要求|备注|地址|电话|手机|微信|联系方式|联系|截止|功能|内容|项目|说明|问题|网址|链接|你好|您好)$/
// 像人的称呼：张总、王哥、李老板、陈先生、小王、老李……
const NAME_LIKE = /^(?:[一-龥]{1,3}(?:总|哥|姐|老板|先生|女士|小姐|老师|经理|主任|店长|工)|[小老阿][一-龥])$/

// 一行开头是谁说的：「张总：……」「张三 10:32 ……」，或者聊天记录里称呼单独占一行「张三:」
// 只认像称呼的，免得把「官网改版：首页……」里的「官网改版」当成客户
function splitSpeaker(line) {
  const timed = line.match(/^([一-龥A-Za-z·]{1,10})\s+\d{1,2}:\d{2}(?::\d{2})?\s*(.*)$/)
  if (timed && !LABELS.test(timed[1])) return { name: timed[1], rest: timed[2] }
  const m = line.match(/^([一-龥A-Za-z·]{1,10})\s*[：:]\s*(.*)$/)
  if (m && !LABELS.test(m[1]) && (NAME_LIKE.test(m[1]) || !m[2])) return { name: m[1], rest: m[2] }
  return null
}

// 客户称呼：「客户：张总」，或者微信里复制出来的「张总：……」「张总 10:32」
function parseCustomer(t) {
  const labeled = t.match(/(?:客户|联系人|称呼)\s*[：:]\s*([^\s，,。；;：:]{1,12})/)
  if (labeled) return labeled[1]
  const first = t.split('\n').map((s) => s.trim()).find(Boolean) || ''
  return splitSpeaker(first)?.name || ''
}

// 联系方式：手机号优先，其次微信号
function parseContact(t) {
  const phone = t.match(/(?:^|[^\d])(1[3-9]\d{9})(?!\d)/)
  if (phone) return phone[1]
  const wx = t.match(/(?:微信号?|[vV]信|[vV][xX]|[wW][xX])\s*[号:：]?\s*([A-Za-z][-_A-Za-z0-9]{5,19})/)
  if (wx) return '微信 ' + wx[1]
  return ''
}

// 项目名：取第一句话，去掉开头的客户称呼、「你好」和「想做一个」这类话
// 例如「张总：我们想做一个企业官网，首页、产品……」→「企业官网」
const META_LINE = /^(客户|联系人|称呼|电话|手机|微信|预算|报价|价格|截止|时间|工期|地址)\s*[：:]/
const WANT = /^(?:我们|我)?(?:想|要|需要|打算|准备)?(?:找你们|找你)?(?:做|搞|开发|定制|弄)(?:一个|一款|一套|个)?/
const firstClause = (s) => s.split(/[，,。；;！!？?]/)[0].trim()
export function titleFromText(text) {
  const lines = String(text || '').split('\n').map((s) => s.trim()).filter((s) => s && !META_LINE.test(s))
  for (const line of lines) {
    // 「张总：」单独一行、需求在下一行时，这一行去掉称呼后是空的，接着看下一行
    const speaker = splitSpeaker(line)
    const said = (speaker ? speaker.rest : line.replace(/^(?:需求|项目|内容|功能|说明)\s*[：:]\s*/, ''))
      .replace(/^(?:你好|您好|在吗)[，,！!。\s]*/, '')
      .trim()
    if (!said) continue
    // 去掉「我们想做一个」后剩下的太短（「做个官网」→「官网」）就不去了
    const plain = said.replace(WANT, '').trim()
    const body = firstClause(plain).length >= 4 ? plain : said
    const clause = firstClause(body)
    const title = clause.length >= 4 ? clause : body
    return cut(title)
  }
  // 只有「你好」「在吗」这种：就用第一行，不让建单卡住
  return cut(String(text || '').split('\n').map((s) => s.trim()).find(Boolean) || '')
}
function cut(s) {
  return s.length > 30 ? s.slice(0, 30) + '…' : s
}

function weekendOffset() {
  const day = new Date().getDay() // 0 周日
  return (6 - day + 7) % 7 || 6 // 到本周六
}

function pad(n) {
  return String(n).padStart(2, '0')
}
