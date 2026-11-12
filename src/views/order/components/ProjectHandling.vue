<template>
  <div class="handling">
    <div class="handling-line">
      <span class="handling-state" :class="{ done: order.handled }">{{ order.taskTurns?.manual?.submittedAt ? '等' + (order.taskTurns.manual.requesterId === currentMember.id ? '你' : order.taskTurns.manual.requesterName) + '确认' : order.handled ? '已处理' : '未处理' }}</span>
      <div v-if="canMark" class="handling-actions">
        <button v-if="!order.handled && !order.handledTime && !['done', 'cancelled'].includes(order.status)" type="button" class="handling-action"
          :disabled="saving" @click="mark(false)">加入待处理</button>
        <TaskReviewActions v-if="order.taskTurns?.manual?.submittedAt && order.taskTurns.manual.requesterId === currentMember.id" :item="{ order, id:order.id, kind:'manualReview' }" />
        <HandoffCompleteButton v-if="order.taskTurns?.manual && !order.taskTurns.manual.submittedAt && order.ownerId === currentMember.id"
          :item="{ order, kind:'manual', turn:order.taskTurns.manual }" />
        <button v-else-if="!order.taskTurns?.manual" type="button" class="handling-action" :disabled="saving" @click="mark(!order.handled)">
          {{ saving ? '保存中…' : order.handled ? '改为未处理' : '完成' }}
        </button>
      </div>
    </div>
    <HandoffReturn :turn="order.taskTurns?.manual" />
    <small v-if="order.handledTime || order.createTime">{{ order.handledTime ? '标记于' : '创建于' }}
      <time>{{ (order.handledTime || order.createTime).slice(0, 16) }}</time>
    </small>
    <small v-else>尚未标记</small>
  </div>
</template>

<script setup>
import HandoffReturn from '@/components/HandoffReturn.vue'
import HandoffCompleteButton from '@/components/HandoffCompleteButton.vue'
import TaskReviewActions from '@/components/TaskReviewActions.vue'
import { offerOrderUndo } from '@/utils/orderUndo'
import { ref, computed } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import { isBoss, currentMember, getOrder, setOrderHandled } from '@/mock/store'

const props = defineProps({ order: {type: Object, required: true} })
const canMark = computed(() => isBoss.value || props.order.ownerId === currentMember.value.id)
const saving = ref(false)
async function mark(handled) {
  if (saving.value || !canMark.value) return
  saving.value = true
  const row = props.order
  const previous = Boolean(row.handled)
  const hadMark = Boolean(row.handledTime)
  try {
    const updated = await setOrderHandled(row, handled)
    if (updated.taskTurns?.manual?.submittedAt) {
      ElMessage.success('已提交，等' + updated.taskTurns.manual.requesterName + '确认')
      return
    }
    // The API can mark either state, but cannot remove a project's very first mark.
    if (hadMark && previous !== handled) {
      const markedAt = updated.handledTime
      offerOrderUndo(row.id, 'manual', handled ? '已标为已处理' : '已标为未处理',
        cur => cur.handled === handled && cur.handledTime === markedAt, cur => setOrderHandled(cur, previous))
    } else {
      ElMessage.success(handled ? '已标为已处理' : '已加入待处理')
    }
  } catch (e) {
    ElMessage.error(e.message || '未能保存处理状态')
    await getOrder(row.id).catch(() => {})
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.handling { display:grid; gap:4px; margin-top:10px }
.handling-line { display:flex; justify-content:space-between; gap:8px; align-items:center }
.handling-state { border-radius:5px; padding:2px 7px; color:#8a4c0e; background:#fff3df; font-size:12px; font-weight:600 }
.handling-state.done { color:#216643; background:#e7f5ed }
.handling-action { border:0; padding:4px 0 4px 6px; background:none; color:#245eb1; font:inherit; font-size:13px; cursor:pointer }
.handling-action:disabled { color:#64758a; cursor:wait }
.handling small { color:#5b6b80; font-size:12px; font-variant-numeric:tabular-nums }
.handling-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end }
</style>
