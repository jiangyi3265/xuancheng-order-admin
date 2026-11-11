<template>
  <span class="task-decisions">
    <button type="button" :disabled="busy" @click="decide('confirm')">确认完成</button>
    <button type="button" :disabled="busy" @click="decide('return')">退回处理</button>
  </span>
</template>
<script setup>
import { computed } from 'vue'
import { reviewsInFlight } from '@/utils/handoffs'
import { reviewTaskTurn, updateBugStatus, getOrder } from '@/mock/store'
import { memberMap } from '@/constants/options'
import { toast } from '@/utils/toast'
const props = defineProps({ item:{ type:Object, required:true } })
const busy = computed(() => reviewsInFlight.has(props.item.id))
async function decide(decision) {
  if (busy.value) return
  const projectId = props.item.id
  reviewsInFlight.add(projectId)
  const row = props.item
  try {
    if (row.kind === 'issueReview') await updateBugStatus(row.bugId,decision==='confirm' ? 'resolved' : 'action','ai_review')
    else await reviewTaskTurn(row.order,row.kind === 'nextReview' ? 'next' : 'manual',decision)
    const owner = row.kind === 'nextReview'
      ? row.order.nextOwnerName || memberMap[row.order.nextOwnerId ?? row.order.ownerId]?.name
      : memberMap[row.order.ownerId]?.name
    toast.success(decision === 'confirm' ? '已验收完成' : '已退回给' + (owner || '负责人') + '继续处理')
  } catch (err) {
    toast.error(err.message || '操作失败，请重试')
    await getOrder(row.id).catch(() => {})
  } finally { reviewsInFlight.delete(projectId) }
}
</script>
<style scoped>
.task-decisions {display:flex;gap:5px;flex-wrap:wrap}
button {font:inherit;font-size:13px;padding:5px 8px;border:1px solid #bad0f1;background:white;color:#2059aa;border-radius:6px;cursor:pointer}
button:first-child {background:#edf4ff}
</style>
