import { memberMap } from '@/constants/options'
import { fmtTime } from '@/utils/time'

export const pendingLabels = { urgent: '加急', bug: '问题', next: '下一步', manual: '手动标记' }

export function pendingItems(orders) {
  const groups = { urgent: [], bug: [], next: [], manual: [] }
  for (const row of orders) {
    if (row.status === 'done' || row.status === 'cancelled') continue
    const owner = memberMap[row.ownerId]?.name || ''
    const project = { id: row.id, title: row.title, order: row, recipientId: row.ownerId, recipient: owner }
    if (row.urgentUntil && !row.handled) {
      groups.urgent.push({ ...project, key: row.id + '-urgent', kind: 'urgent',
        text: '截止 ' + row.urgentUntil, meta: owner, due: row.urgentUntil })
    }
    if (row.newBugCount > 0 && row.newBugPreview?.id) {
      const bug = row.newBugPreview
      groups.bug.push({ ...project, key: row.id + '-new-' + bug.id, kind:'bug', fresh:true, bugId:bug.id,
        text:bug.content || '查看问题附件', meta:'客户新问题 · ' + owner })
    }
    if (Number(row.actionBugCount) > 0) {
      const bugs = row.actionBugPreviews || []
      if (bugs.length) {
        for (const bug of bugs) {
          groups.bug.push({ ...project, key: row.id + '-bug-' + bug.id, kind: 'bug', bugId: bug.id,
            text: bug.content?.trim() || '查看问题附件', meta: owner })
        }
      } else {
        // Older list responses have the count only. Use the existing project issue queue.
        groups.bug.push({ ...project, key: row.id + '-bugs', kind: 'bug',
          text: row.actionBugCount + ' 个问题需处理', meta: owner })
      }
    }
    if (row.nextStep?.trim()) {
      const assignee = memberMap[row.nextOwnerId]?.name || row.nextOwnerName || owner
      groups.next.push({ ...project, key: row.id + '-next', kind: 'next', text: row.nextStep,
        recipientId: row.nextOwnerId ?? row.ownerId, recipient: assignee,
        meta: [assignee, row.nextDue && ('截止 ' + row.nextDue)].filter(Boolean).join(' · '), due: row.nextDue })
    }
    if (!row.handled && row.handledTime) {
      groups.manual.push({ ...project, key: row.id + '-manual', kind: 'manual', text: '项目已标为未处理',
        meta: [owner, fmtTime(row.handledTime)].filter(Boolean).join(' · ') })
    }
  }
  const dueFirst = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.id - a.id
  groups.urgent.sort(dueFirst)
  groups.next.sort(dueFirst)
  groups.bug.sort((a, b) => (b.bugId || 0) - (a.bugId || 0))
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const dueNow = item => item.due && item.due.slice(0, 10) <= today
  const dated = [...groups.urgent, ...groups.next]
  const byDeadline = (a, b) => {
    const minute = date => date.length === 10 ? date + ' 23:59' : date
    return minute(a.due).localeCompare(minute(b.due)) || b.id - a.id
  }
  const ordered = [
    ...dated.filter(dueNow).sort(byDeadline),
    ...groups.urgent.filter(item => !dueNow(item)), ...groups.bug,
    ...groups.next.filter(item => !dueNow(item)), ...groups.manual
  ]
  return ordered.map(item => {
    const key = item.kind === 'bug' ? (item.bugId ? 'bug-' + item.bugId : 'bugs') : item.kind
    return { ...item, receipt: item.order.reminderReceipts?.[key] }
  })
}

export function pendingDestination(item, currentQuery = {}) {
  const query = { ...currentQuery, id: String(item.id) }
  for (const key of ['tab', 'entry', 'bug', 'todo', 'followup', 'create', 't']) delete query[key]
  if (item.kind === 'bug') {
    query.tab = 'bugs'
    if (item.bugId) query.bug = String(item.bugId)
    else query.todo = '1'
  } else if (item.kind === 'manual') query.followup = 'manual'
  return { path: '/order', query }
}
