// A project can have an urgent result, an issue and a delivery waiting independently.
export function reviewItems(orders, memberId, isBoss) {
  const rows = []
  for (const order of orders) {
    const handoff = order.urgentHandoff
    const add = (kind, text, bugId) => rows.push({
      kind, key: [order.id, kind, bugId].filter(Boolean).join('-'), id: order.id,
      order, title: order.title, text, bugId, time: handoff?.submittedAt || order.updateTime || ''
    })
    if (handoff?.submittedAt && handoff.requesterId === memberId)
      add('urgentReview', (handoff.submittedName || '负责人') + ' 已提交加急结果')
    if (['done', 'cancelled'].includes(order.status)) continue
    if (isBoss && order.status === 'review') add('deliveryReview', '项目已提交验收')
    if (isBoss) for (const bug of order.internalReviewIssues || [])
      add('issueReview', '问题 #' + bug.id + ' · ' + (bug.content || '查看修改结果'), bug.id)
  }
  return rows.sort((a,b) => b.time.localeCompare(a.time) || b.id - a.id)
}
export const reviewLabels = { urgentReview: '加急确认', deliveryReview: '项目验收', issueReview: '问题验收' }
