// 「需要我处理」清单：工作台和侧栏红点共用这一份，两边的数字永远对得上。
// 以前要处理的事散在工作台、消息中心、审批中心几处，而且说法对不上；现在都汇总到这里，每条带处理按钮。
// 一个项目只出现一次，取最要紧的那个原因；审批单单独列（老板）。报价单在工作台顶部的报价面板里，不重复列。
import { computed } from 'vue'
import { orders, pendingApprovals, currentMember, isBoss } from '@/mock/store'
import { memberMap } from '@/constants/options'
import { nextDueState, shortDue } from '@/utils/workbench'
import { todayStr, dateAfterDays } from '@/utils/date'

const CLOSED = ['done', 'cancelled']
// 后端拒单 / 交回时写进时间线的原话：「小王 拒绝了项目：这周排满了」「小王 交回项目：客户联系不上」
const RETURNED = /^(.+?) (拒绝了项目|交回项目)：([\s\S]*)$/
// 客户的消息超过两周没人回的就不再算待办（多半是早就结束的项目里一句「谢谢」）
const REPLY_DAYS = 14

const ownerName = (o) => memberMap[o.ownerId]?.name || '负责人'

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

function nextText(o) {
  const due = nextDueState(o)
  const when = o.nextDue ? (due === 'overdue' ? '（已过期 · ' + shortDue(o.nextDue) + '）' : '（' + shortDue(o.nextDue) + ' 前）') : ''
  return '下一步：' + o.nextStep + when
}

function messageText(last) {
  if (last.content) return '客户：' + last.content
  return last.hasAttachments ? '客户发来了图片或文件' : '客户发来了消息'
}

// 下一步交给谁：没单独指定时算项目负责人（和顶部「待处理通知」铃铛的口径一致）
export function isMyNextStep(o, me) {
  return !!String(o?.nextStep || '').trim() && String(o.nextOwnerId ?? o.ownerId) === String(me)
}

// 这个项目为什么需要我处理；不需要就返回 null。rank 越小越靠前。
// 顶部铃铛里「分给我」的加急、问题、下一步、手动标记，这里都包含，工作台的清单只多不少。
export function todoReason(o, me, boss, today = todayStr()) {
  if (!o) return null
  const mine = String(o.ownerId) === String(me)
  const myNext = isMyNextStep(o, me)
  const open = !CLOSED.includes(o.status)
  if (boss && mine) {
    const r = returnInfo(o)
    if (r) return { kind: 'returned', rank: 0, text: `${r.who} ${r.action}：${r.why || '没写原因'}` }
  }
  const message = colleagueTask(o, me)
  if (message) return message
  if (open && mine && o.urgentUntil && !o.handled) return { kind: 'urgent', rank: 2, text: '加急：' + o.urgentUntil + ' 前要处理' }
  if (mine && waitingReply(o)) return { kind: 'reply', rank: 4, text: messageText(o.lastMessage) }
  if (!open) return null
  if (myNext && nextDueState(o)) return { kind: 'next', rank: 5, text: nextText(o) }
  if (!boss && mine && o.assignState === 'pending') return { kind: 'assign', rank: 6, text: '分配给你的新项目：先接收，再开工' }
  // 客户自己提交、还没人动过的新需求
  if (mine && o.status === 'pending' && o.channel === 'form' && o.assignState !== 'pending' && !o.nextStep &&
      (!o.lastEvent || o.lastEvent.type === 'create')) {
    const who = o.customer ? '客户「' + o.customer + '」' : '客户'
    return { kind: 'request', rank: 6, text: who + '提交了新需求' + (boss ? '，派给谁做？' : '，先看一下') }
  }
  if (mine && Number(o.actionBugCount) > 0) return { kind: 'bugs', rank: 7, text: o.actionBugCount + ' 条问题已标记需处理' }
  if (mine && !o.handled && o.handledTime) return { kind: 'manual', rank: 8, text: '项目标成了「未处理」，处理完记得标回来' }
  if (boss && o.status === 'review') return { kind: 'review', rank: 9, text: `${ownerName(o)} 做完提交了，等你验收` }
  if (mine && ['pending', 'doing'].includes(o.status) && o.assignState !== 'pending' && o.deadline && o.deadline < today) {
    return { kind: 'overdue', rank: 10, text: '已逾期（截止 ' + shortDue(o.deadline) + '）' }
  }
  if (myNext) return { kind: 'next', rank: 11, text: nextText(o) }
  return null
}

const sortKey = (t) => t.order?.nextDue || t.order?.deadline || '9999-99-99'

export const todoItems = computed(() => {
  const me = currentMember.value.id
  const boss = isBoss.value
  const today = todayStr()
  const list = []
  for (const o of orders) {
    const r = todoReason(o, me, boss, today)
    if (r) list.push({ key: 'o' + o.id, ...r, order: o })
  }
  if (boss) {
    for (const a of pendingApprovals.value) {
      list.push({ key: 'a' + a.id, kind: 'approval', rank: 1, text: a.summary || a.typeLabel || '项目变更申请', approval: a })
    }
  }
  return list.sort((a, b) => a.rank - b.rank || String(b.time || '').localeCompare(String(a.time || '')) || sortKey(a).localeCompare(sortKey(b)))
})

// 已经在清单里的项目，其他板块（快被忘了、我手上的）不再重复列
export const todoOrderIds = computed(() => new Set(todoItems.value.filter((t) => t.order).map((t) => t.order.id)))
