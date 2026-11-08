<template>
  <div class="handling">
    <div class="handling-line">
      <span class="handling-state" :class="{ done: order.handled }">{{ order.handled ? '已处理' : '未处理' }}</span>
      <div v-if="canMark" class="handling-actions">
        <button v-if="!order.handled && !order.handledTime && !['done', 'cancelled'].includes(order.status)" type="button" class="handling-action"
          :disabled="saving" @click="mark(false)">加入待处理</button>
        <button type="button" class="handling-action" :disabled="saving" @click="mark(!order.handled)">
          {{ saving ? '保存中…' : order.handled ? '改为未处理' : '标为已处理' }}
        </button>
      </div>
    </div>
    <small v-if="order.handledTime || order.createTime">{{ order.handledTime ? '标记于' : '创建于' }}
      <time>{{ (order.handledTime || order.createTime).slice(0, 16) }}</time>
    </small>
    <small v-else>尚未标记</small>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { isBoss, currentMember, getOrder, setOrderHandled } from '@/mock/store'

const props = defineProps({ order: {type: Object, required: true} })
const canMark = computed(() => isBoss.value || props.order.ownerId === currentMember.value.id)
const saving = ref(false)
async function mark(handled) {
  if (saving.value || !canMark.value) return
  saving.value = true
  const row = props.order
  try {
    await setOrderHandled(row, handled)
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
