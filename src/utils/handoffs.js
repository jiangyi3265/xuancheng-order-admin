import { reactive } from 'vue'
import { memberMap } from '@/constants/options'
import { pendingItems, handoffDate } from './pendingItems'

// All review buttons on one project use its version, including when several cards are open.
export const reviewsInFlight = reactive(new Set())

function sameMember(left, right) {
  return left != null && right != null && String(left) === String(right)
}

export const reviewLabels = {
  urgentReview: '加急确认', deliveryReview: '项目验收', issueReview: '问题验收',
  nextReview: '下一步确认', manualReview: '处理结果确认'
}

// Personal queues use the actual reviewer. The board can also show who a colleague is waiting for.
export function reviewItems(orders, memberId, isBoss, team = false) {
  const rows = []
  for (const order of orders) {
    const add = (kind, text, turn, bugId) => {
      const recipientId = turn?.requesterId
      if (recipientId == null ? !isBoss && !team : !team && !sameMember(recipientId, memberId)) return
      const recipient = turn?.requesterName || memberMap[recipientId]?.name || '项目验收人'
      const receiptKey = bugId ? 'bug-' + bugId : kind.replace(/Review$/, '')
      const receipt = order.reminderReceipts?.[receiptKey]
      const reminded = receipt && turn?.submittedAt && receipt.at >= turn.submittedAt &&
        (receipt.recipientId == null || sameMember(receipt.recipientId, recipientId))
      rows.push({ kind, receipt: reminded ? receipt : null, key: [order.id, kind, bugId].filter(Boolean).join('-'), id: order.id, review: true,
        order, title: order.title, text, bugId, turn, recipientId, recipient,
        mine: recipientId == null ? isBoss : sameMember(recipientId, memberId),
        time: turn?.submittedAt || order.updateTime || '' })
    }
    const urgent = order.urgentHandoff
    if (urgent?.submittedAt) add('urgentReview', urgent.due ? '加急截止 ' + urgent.due : '本次加急结果', urgent)
    if (['done', 'cancelled'].includes(order.status)) continue
    if (order.status === 'review') add('deliveryReview', '项目已提交验收', order.taskTurns?.delivery)
    for (const bug of order.internalReviewIssues || [])
      add('issueReview', '问题 #' + bug.id + ' · ' + (bug.content || '查看修改结果'), order.taskTurns?.['bug-' + bug.id], bug.id)
    if (order.taskTurns?.next?.submittedAt && order.nextStep)
      add('nextReview', order.nextStep, order.taskTurns.next)
    if (order.taskTurns?.manual?.submittedAt && !order.handled)
      add('manualReview', '核对本次项目处理结果', order.taskTurns.manual)
  }
  return rows.sort((a,b) => b.time.localeCompare(a.time) || b.id - a.id)
}

function dueLabel(due) {
  const day = due.slice(0, 10)
  const label = day === handoffDate() ? '今天' : day === handoffDate(1) ? '明天' : day
  const time = due.slice(11, 16)
  return label + (time ? ' ' + time : '') + '前'
}

// Each item has one current actor. The personal waiting list is visible to its other participant.
export function handoffItems(orders, memberId, isBoss) {
  if (memberId == null) return []
  const rows = [...reviewItems(orders, memberId, isBoss, true), ...pendingItems(orders)]
  return rows.map(item => {
    const turn = item.turn
    const mine = item.review ? item.mine : sameMember(item.recipientId, memberId)
    const requester = turn?.requesterName || memberMap[turn?.requesterId]?.name || '发起人'
    const worker = item.review
      ? turn?.submittedName || executorName(item.order, item.kind)
      : item.recipient || '项目负责人'
    const tracking = item.review
      ? sameMember(turn?.submittedBy ?? item.order.ownerId, memberId)
      : sameMember(turn?.requesterId, memberId)
    const lane = mine ? (item.review ? 'review' : 'work') : (item.review ? 'waitingReview' : 'waitingWork')
    const needsAcceptance = !item.review && item.order.assignState === 'pending' && (
      item.kind === 'bug' && !!turn || item.kind === 'urgent' && (!mine || !isBoss)
    )
    let currentAction
    if (item.review && mine) {
      const actor = sameMember(turn?.submittedBy, memberId) ? '你' : worker
      if (!turn?.submittedBy && !turn?.submittedName) {
        currentAction = item.kind === 'deliveryReview' ? '项目已提交，等你验收' : '处理结果等你确认'
      } else if (item.kind === 'deliveryReview') currentAction = actor + ' 提交了项目，等你验收'
      else if (turn?.returnedAt) currentAction = actor + ' 改好了，等你确认' + (turn.submissionCount > 1 ? '（第 ' + turn.submissionCount + ' 次）' : '')
      else currentAction = actor + ' 做完了，等你确认'
    } else if (item.review) {
      currentAction = tracking && turn?.submittedBy != null
        ? (item.kind === 'deliveryReview' ? '已提交验收，等' + item.recipient + '验收' : '已交给' + item.recipient + '，等他确认')
        : '等' + item.recipient + '确认'
    } else if (turn?.returnedAt) {
      const action = item.kind === 'delivery' ? '退回返工' : '退回'
      currentAction = mine ? requester + ' ' + action + (turn.returnNote ? '：' + turn.returnNote : '，请再修改') : '已退回，等' + worker + '再改'
    } else if (!mine) currentAction = item.recipientId == null ? '待指定负责人' : '等' + worker + '处理'
    else if (item.kind === 'delivery') currentAction = '你已撤回提交'
    else if (needsAcceptance) currentAction = '等你接收项目'
    else if (item.fresh) currentAction = '客户提了新问题，等你查看'
    else currentAction = turn && !sameMember(turn.requesterId, memberId) ? requester + ' 交代给你' : '等你处理'
    const due = item.due || (item.kind === 'nextReview' ? item.order.nextDue : item.kind === 'urgentReview' ? turn?.due : '')
    if (due) currentAction += ' · ' + dueLabel(due)
    const noteBy = sameMember(turn?.submittedBy, memberId) ? '你' : worker
    const handoffNote = item.review && turn?.submitNote ? noteBy + '：' + turn.submitNote : ''
    return { ...item, mine, personal: mine || tracking, lane, handoff: true, needsAcceptance, currentAction, handoffNote, due }
  })
}

export function submitLabel(turn) {
  return turn ? '做完了' : '完成'
}

export function executorName(order, kind) {
  const next = kind === 'next' || kind === 'nextReview'
  const id = next ? order.nextOwnerId ?? order.ownerId : order.ownerId
  return (next && order.nextOwnerName) || memberMap[id]?.name || order.collaborators?.find(person => sameMember(person.id, id))?.name || order.ownerName || '项目负责人'
}
