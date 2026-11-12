<template>
  <span class="task-decisions">
    <button type="button" :disabled="busy" @click="decide('confirm')">通过</button>
    <button type="button" :disabled="busy" @click="decide('return')">退回</button>
  </span>
</template>
<script setup>
import { computed } from 'vue'
import { executorName, reviewsInFlight } from '@/utils/handoffs'
import { reviewTaskTurn, updateBugStatus, latestOrderVersion, getOrder } from '@/mock/store'
import { askReturnNote } from '@/utils/handoffReturn'
import { toast } from '@/utils/toast'
import { sentToCustomer } from '@/utils/customerConfirm'
const props = defineProps({ item:{ type:Object, required:true } })
const executor = computed(() => executorName(props.item.order, props.item.kind))
const busy = computed(() => reviewsInFlight.has(props.item.id))
async function decide(decision) {
  if (busy.value) return
  const projectId = props.item.id
  reviewsInFlight.add(projectId)
  const row = props.item
  const version = latestOrderVersion(row.order)
  const submission = row.turn?.submittedAt ? { ...row.turn } : undefined
  try {
    const title = row.order.title + (row.bugId ? ' · 问题 #' + row.bugId : '')
    const note = decision === 'return' ? await askReturnNote(title, executor.value) : undefined
    let result
    if (row.kind === 'issueReview') result = await updateBugStatus(row.bugId, decision === 'confirm' ? 'resolved' : 'action', 'ai_review', note, submission)
    else await reviewTaskTurn(row.order, row.kind === 'nextReview' ? 'next' : 'manual', decision, note, version)
    // 客户提的问题：通过后不是直接解决，而是「已处理」发给客户确认
    toast.success(decision === 'confirm' ? (sentToCustomer(result, row.bugId) ? '已通过，已发给客户确认' : '已验收完成') : '已退回给' + executor.value + '继续处理')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    toast.error(err.message || '操作失败，请重试')
    await getOrder(row.id).catch(() => {})
  } finally { reviewsInFlight.delete(projectId) }
}
</script>
<style scoped>
.task-decisions {display:flex;gap:5px;flex-wrap:wrap}
button {font:inherit;font-size:13px;padding:5px 8px;border:1px solid #bad0f1;background:white;color:#2059aa;border-radius:6px;cursor:pointer}
button:first-child {background:#1959bd;color:white;border-color:#1959bd}
button {min-height:34px;overflow-wrap:anywhere}
@media(max-width:600px){button {min-height:44px}}
</style>
