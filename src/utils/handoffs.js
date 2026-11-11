import { reactive } from 'vue'
import { memberMap } from '@/constants/options'
import { pendingItems } from './pendingItems'

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
      rows.push({ kind, key: [order.id, kind, bugId].filter(Boolean).join('-'), id: order.id, review: true,
        order, title: order.title, text, bugId, turn, recipientId, recipient,
        mine: recipientId == null ? isBoss : sameMember(recipientId, memberId),
        time: turn?.submittedAt || order.updateTime || '' })
    }
    const urgent = order.urgentHandoff
    if (urgent?.submittedAt) add('urgentReview', urgent.due ? '加急截止 ' + urgent.due : '本次加急结果', urgent)
    if (['done', 'cancelled'].includes(order.status)) continue
    if (order.status === 'review') add('deliveryReview', '项目已提交验收')
    for (const bug of order.internalReviewIssues || [])
      add('issueReview', '问题 #' + bug.id + ' · ' + (bug.content || '查看修改结果'), order.taskTurns?.['bug-' + bug.id], bug.id)
    if (order.taskTurns?.next?.submittedAt && order.nextStep)
      add('nextReview', order.nextStep, order.taskTurns.next)
    if (order.taskTurns?.manual?.submittedAt && !order.handled)
      add('manualReview', '核对本次项目处理结果', order.taskTurns.manual)
  }
  return rows.sort((a,b) => b.time.localeCompare(a.time) || b.id - a.id)
}

// A lane is relative to the signed-in person. The same item has only one current actor.
export const handoffLanes = [
  { key: 'review', label: '待我验收', empty: '目前没有等你验收的结果' },
  { key: 'work', label: '待我处理', empty: '目前没有轮到你处理的事项' },
  { key: 'waitingWork', label: '等同事处理', empty: '目前没有等同事处理的事项' },
  { key: 'waitingReview', label: '等同事验收', empty: '目前没有等同事验收的结果' }
]

export function handoffItems(orders, memberId, isBoss) {
  if (!memberId) return []
  const rows = [...reviewItems(orders, memberId, isBoss, true), ...pendingItems(orders)]
  return rows.map(item => {
    const mine = item.review ? item.mine : sameMember(item.recipientId, memberId)
    const actor = mine ? '你' : item.recipient || '项目负责人'
    const turn = item.turn
    if (item.review) {
      const submitter = sameMember(turn?.submittedBy, memberId) ? '你' : turn?.submittedName || memberMap[turn?.submittedBy]?.name
      // Older internal and project reviews record no submitter. Keep the owner's tracking view
      // without attributing the submission to someone whose identity was not recorded.
      const tracking = turn?.submittedBy != null ? sameMember(turn.submittedBy, memberId) : sameMember(item.order.ownerId, memberId)
      return { ...item, mine, personal: mine || tracking, lane: mine ? 'review' : 'waitingReview',
        currentAction: '现在由' + actor + '验收', handoffNote: submitter ? submitter + '已提交处理结果' : '' }
    }
    const receiver = sameMember(turn?.requesterId, memberId) ? '你' : turn?.requesterName || memberMap[turn?.requesterId]?.name || '发起人'
    const needsAcceptance = item.order.assignState === 'pending' && (
      (item.kind === 'bug' && !!turn) || (item.kind === 'urgent' && (!mine || !isBoss))
    )
    return { ...item, mine, needsAcceptance, personal: mine || sameMember(turn?.requesterId, memberId), lane: mine ? 'work' : 'waitingWork',
      currentAction: item.recipientId == null ? '待指定负责人' : '现在由' + actor + (needsAcceptance ? '接单' : item.fresh ? '查看客户反馈' : '处理'),
      handoffNote: turn ? '完成后交给' + receiver + '验收' : '' }
  })
}

export function handoffGroups(items) {
  return handoffLanes.map(lane => ({ ...lane, rows: items.filter(item => item.lane === lane.key) }))
}
