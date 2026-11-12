import { computed } from 'vue'
import { handoffItems } from './handoffs'
import { handoffDate } from './pendingItems'
import { orders, pendingApprovals, currentMember, isBoss } from '@/mock/store'
import { memberMap } from '@/constants/options'
import { shortDue } from '@/utils/workbench'
import { todayStr, dateAfterDays } from '@/utils/date'

const CLOSED = ['done', 'cancelled']
// 后端拒单 / 交回时写进时间线的原话：「小王 拒绝了项目：这周排满了」「小王 交回项目：客户联系不上」
const RETURNED = /^(.+?) (拒绝了项目|交回项目)：([\s\S]*)$/
// 客户的消息超过两周没人回的就不再算待办（多半是早就结束的项目里一句「谢谢」）
const REPLY_DAYS = 14

// 员工拒单 / 交回：项目回到老板名下、变回待确认，时间线最后一条就是原因
export function returnInfo(o) {
  if (!o || o.status !== 'pending' || o.assignState === 'pending') return null
  const e = o.lastEvent
  if (!e || e.type !== 'note') return null
  const m = RETURNED.exec(String(e.content || ''))
  if (!m) return null
  return { who: e.user || m[1], action: m[2] === '拒绝了项目' ? '拒了这单' : '把这单交回了', why: m[3].trim() }
}

export function mentionText(sender, content) {
  const text = String(content || '').trim()
  const from = sender || '同事'
  return text && text !== '（无文字）' ? from + '：' + text : from + ' 发来了图片 / 文件'
}

export function colleagueTask(o, me) {
  const e = o.lastEvent || o.timeline?.at(-1)
  const nudge = e?.type === 'note' && /^(.+?) 催了一下：/.exec(e.content || '')
  if (nudge && o.unread?.includes(me) && e.user !== currentMember.value.name &&
      (o.ownerId === me || isBoss.value && memberMap[o.ownerId]?.name === e.user)) {
    return { kind: 'nudge', rank: 2, time: e.time, text: (e.user || nudge[1]) + ' 催你跟进这个项目' }
  }
  const m = o.myMention
  if (!m) return null
  return { kind: 'mention', rank: 3, time: m.time, text: mentionText(m.from, m.content) }
}

export function unreadNotes(order, me) {
  return (order?.timeline || []).filter(row => row.mentions?.some(m => String(m.memberId) === String(me) && !m.read))
}

// 客户发来的消息还没人回：最后一条沟通是客户发的（两周内）
export function waitingReply(o) {
  const last = o?.lastMessage
  if (!last || last.type !== 'message' || o.status === 'cancelled') return false
  const day = String(last.time || '').slice(0, 10)
  return !day || day >= dateAfterDays(-REPLY_DAYS)
}

function messageText(last) {
  if (last.content) return '客户：' + last.content
  return last.hasAttachments ? '客户发来了图片或文件' : '客户发来了消息'
}

// 下一步交给谁：没单独指定时算项目负责人（和顶部「待处理通知」铃铛的口径一致）
export function isMyNextStep(o, me) {
  return !o?.taskTurns?.next?.submittedAt && !!String(o?.nextStep || '').trim() && String(o.nextOwnerId ?? o.ownerId) === String(me)
}

// Independent customer replies, assignments and mentions can belong to the same project.
function projectTodos(o, me, boss, today, hasHandoff) {
  const mine = String(o.ownerId) === String(me)
  const rows = []
  const returned = boss && mine ? returnInfo(o) : null
  if (returned) rows.push({ kind: 'returned', rank: 0, text: returned.who + ' ' + returned.action + '：' + (returned.why || '没写原因') })
  const message = colleagueTask(o, me)
  if (message) rows.push(message)
  if (mine && waitingReply(o)) rows.push({ kind: 'reply', rank: 4, text: messageText(o.lastMessage) })
  if (!mine || CLOSED.includes(o.status)) return rows
  if (!boss && o.assignState === 'pending') {
    rows.push({ kind: 'assign', rank: 6, text: '分配给你的新项目：先接收，再开工' })
  }
  if (o.status === 'pending' && o.channel === 'form' && o.assignState !== 'pending' && !o.nextStep &&
      (!o.lastEvent || o.lastEvent.type === 'create')) {
    const who = o.customer ? '客户「' + o.customer + '」' : '客户'
    rows.push({ kind: 'request', rank: 6, text: who + '提交了新需求' + (boss ? '，派给谁做？' : '，先看一下') })
  }
  if (!rows.length && !hasHandoff && ['pending', 'doing'].includes(o.status) && o.assignState !== 'pending' && o.deadline && o.deadline < today) {
    rows.push({ kind: 'overdue', rank: 10, text: '已逾期（截止 ' + shortDue(o.deadline) + '）' })
  }
  return rows
}

const sortKey = (t) => t.due || t.order?.nextDue || t.order?.deadline || '9999-99-99'

export const teamHandoffs = computed(() => handoffItems(orders, currentMember.value.id, isBoss.value))
export const waitingHandoffs = computed(() => teamHandoffs.value.filter(item => item.personal && !item.mine))

export function inboxRank(item, today) {
  if (item.turn?.returnedAt && !item.review) return -2
  if (item.due && item.due.slice(0, 10) <= today) return -1
  return item.review ? 3 : 5
}

export const todoItems = computed(() => {
  const me = currentMember.value.id
  const boss = isBoss.value
  const today = todayStr()
  if (me == null) return []
  const handoffs = teamHandoffs.value.filter(item => item.mine)
  const handoffToday = handoffDate()
  const list = handoffs.map(item => ({ ...item, rank: inboxRank(item, handoffToday) }))
  const covered = new Set(teamHandoffs.value.filter(item => item.personal).map(item => item.id))
  for (const order of orders) {
    for (const row of projectTodos(order, me, boss, today, covered.has(order.id))) {
      list.push({ ...row, key: order.id + '-' + row.kind, order })
    }
  }
  if (boss) {
    for (const a of pendingApprovals.value) {
      list.push({ key: 'a' + a.id, kind: 'approval', rank: 1, text: a.summary || a.typeLabel || '项目变更申请', approval: a })
    }
  }
  return list.sort((a, b) => a.rank - b.rank || String(b.time || '').localeCompare(String(a.time || '')) || sortKey(a).localeCompare(sortKey(b)))
})

// 已经在清单里的项目，其他板块（快被忘了、我手上的）不再重复列
export const todoOrderIds = computed(() => new Set([...todoItems.value, ...waitingHandoffs.value].filter(t => t.order).map(t => t.order.id)))
