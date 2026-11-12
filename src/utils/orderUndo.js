import { completeNextStep, completePendingItem, editOrder, getOrder, loadOrders, removeOrder, restoreOrder,
  setNextStep, setOrderHandled, setProjectUrgency, token, updateBugStatus } from '@/mock/store'
import { toast } from '@/utils/toast'
import { undoToast } from '@/utils/undoToast'
import { sentToCustomer } from '@/utils/customerConfirm'

// Check the affected field just before undoing. Other people may have worked on the project meanwhile.
export function offerOrderUndo(id, field, message, matches, restore) {
  const session = token.value
  return undoToast(id + ':' + field, message, async () => {
    const current = await getOrder(id)
    if (token.value !== session) throw new Error('登录账号已切换')
    if (!current || !matches(current)) throw new Error('这项内容已有新变化，请查看项目')
    try { await restore(current) }
    catch (error) { await getOrder(id).catch(() => {}); throw error }
  })
}

export async function trashWithUndo(order) {
  const id = order.id
  await removeOrder(id)
  undoToast(id + ':trash', '「' + order.title + '」已放进回收站', async () => {
    try { await restoreOrder(id) }
    catch (error) { await loadOrders().catch(() => {}); throw error }
  })
}

export async function assignWithUndo(order, ownerId, message) {
  const previous = order.ownerId
  const id = order.id
  const updated = await editOrder({ id, ownerId })
  const assignment = updated.assignState
  offerOrderUndo(id, 'owner', message,
    cur => cur.ownerId === ownerId && cur.assignState === assignment && !['done', 'cancelled'].includes(cur.status),
    () => editOrder({ id, ownerId: previous }))
}

function nextSnapshot(order) {
  return { content: order.nextStep, ownerId: order.nextOwnerId ?? order.ownerId, due: order.nextDue || '' }
}

// The workbench can ask for another step first; offer undo only when that prompt closes without a replacement.
export async function finishNext(order) {
  const previous = nextSnapshot(order)
  const id = order.id
  const updated = await completeNextStep(id)
  if (updated?.taskTurns?.next?.submittedAt) {
    toast.success('已提交，等' + updated.taskTurns.next.requesterName + '确认')
    return null
  }
  return (onRestored) => offerOrderUndo(id, 'next', '已完成「' + previous.content + '」',
    cur => !cur.nextStep && !['done', 'cancelled'].includes(cur.status),
    async () => { await setNextStep(id, previous); onRestored?.() })
}

export async function finishPendingWithUndo(order, kind, bugId, message, submitNote = '', version) {
  const previous = nextSnapshot(order)
  const due = order.urgentUntil
  const id = order.id
  const updated = await completePendingItem(order, kind, bugId, submitNote, version)
  const turn = updated.taskTurns?.[kind === 'bug' ? 'bug-' + bugId : kind]
  // 客户提的问题做完是「已处理」，已经发给客户确认，撤不回来，只提示一句
  if (kind === 'bug' && sentToCustomer(updated, bugId)) {
    toast.success(message)
    return
  }
  if (turn?.submittedAt) {
    toast.success('已提交，等' + turn.requesterName + '确认')
    return
  }
  const markedAt = updated.handledTime
  if (updated.urgentHandoff?.submittedAt && (kind === 'urgent' || kind === 'manual')) {
    toast.success('已提交加急结果，等' + (updated.urgentHandoff.requesterName || '发起人') + '确认')
    return
  }
  switch (kind) {
    case 'next':
      return offerOrderUndo(id, kind, message, cur => !cur.nextStep, () => setNextStep(id, previous))
    case 'urgent':
      return offerOrderUndo(id, kind, message, cur => !cur.urgentUntil && !cur.handled && !['done', 'cancelled'].includes(cur.status),
        () => setProjectUrgency(id, due, null))
    case 'manual':
      return offerOrderUndo(id, kind, message, cur => cur.handled && cur.handledTime === markedAt, cur => setOrderHandled(cur, false))
    case 'bug':
      return offerOrderUndo(id, 'bug-' + bugId, message, cur => cur.bugs?.find(b => b.id === bugId)?.status === 'resolved',
        () => updateBugStatus(bugId, 'action'))
  }
}
