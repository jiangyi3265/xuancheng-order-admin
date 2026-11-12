<template>
  <span class="urgent-decisions" @click.stop>
    <el-button size="small" type="primary" :disabled="busy" @click="decide('confirm')">通过</el-button>
    <el-button v-if="!['done', 'cancelled'].includes(order.status)" size="small" :disabled="busy" @click="decide('return')">退回</el-button>
  </span>
</template>
<script setup>
import { computed } from 'vue'
import { executorName, reviewsInFlight } from '@/utils/handoffs'
import { askReturnNote } from '@/utils/handoffReturn'
import { getOrder, latestOrderVersion, reviewUrgency } from '@/mock/store'
import { toast } from '@/utils/toast'
const props = defineProps({ order: { type: Object, required: true } })
const executor = computed(() => executorName(props.order, 'urgent'))
const busy = computed(() => reviewsInFlight.has(props.order.id))
async function decide(decision) {
  if (busy.value) return
  const projectId = props.order.id
  reviewsInFlight.add(projectId)
  const { id, title } = props.order
  const version = latestOrderVersion(props.order)
  try {
    const note = decision === 'return' ? await askReturnNote(title, executor.value) : undefined
    await reviewUrgency(id, version, decision, note)
    toast.success(decision === 'confirm' ? '已确认本次加急完成' : '已退回给' + executor.value + '继续处理加急')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    toast.error(err.message || '操作失败，请重试')
    await getOrder(id).catch(() => {})
  } finally { reviewsInFlight.delete(projectId) }
}
</script>
<style scoped>
.urgent-decisions { display:inline-flex; flex-wrap:wrap; gap:6px; align-items:center; }
.urgent-decisions :deep(.el-button) { margin:0; }
</style>
