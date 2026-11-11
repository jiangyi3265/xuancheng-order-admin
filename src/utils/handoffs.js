import { reactive } from 'vue'
import { memberMap } from '@/constants/options'

// All review buttons on one project use its version, including when several cards are open.
export const reviewsInFlight = reactive(new Set())

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
      if (recipientId == null ? !isBoss && !team : !team && recipientId !== memberId) return
      const recipient = turn?.requesterName || memberMap[recipientId]?.name || '项目验收人'
      rows.push({ kind, key: [order.id, kind, bugId].filter(Boolean).join('-'), id: order.id, review: true,
        order, title: order.title, text, bugId, recipientId, recipient,
        mine: recipientId == null ? isBoss : recipientId === memberId,
        time: turn?.submittedAt || order.updateTime || '' })
    }
    const urgent = order.urgentHandoff
    if (urgent?.submittedAt) add('urgentReview', (urgent.submittedName || '负责人') + ' 已提交加急结果', urgent)
    if (['done', 'cancelled'].includes(order.status)) continue
    if (order.status === 'review') add('deliveryReview', '项目已提交验收')
    for (const bug of order.internalReviewIssues || [])
      add('issueReview', '问题 #' + bug.id + ' · ' + (bug.content || '查看修改结果'), order.taskTurns?.['bug-' + bug.id], bug.id)
    if (order.taskTurns?.next?.submittedAt && order.nextStep)
      add('nextReview', order.nextStep, order.taskTurns.next)
    if (order.taskTurns?.manual?.submittedAt && !order.handled)
      add('manualReview', '已提交项目处理结果', order.taskTurns.manual)
  }
  return rows.sort((a,b) => b.time.localeCompare(a.time) || b.id - a.id)
}
