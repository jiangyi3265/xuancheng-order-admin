<template>
  <span class="urgent-decisions" @click.stop>
    <el-button size="small" type="primary" :disabled="busy" @click="decide('confirm')">确认加急完成</el-button>
    <el-button v-if="!['done', 'cancelled'].includes(order.status)" size="small" :disabled="busy" @click="decide('return')">退回处理</el-button>
  </span>
</template>
<script setup>
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getOrder, latestOrderVersion, reviewUrgency } from '@/mock/store'
import { toast } from '@/utils/toast'
const props = defineProps({ order: { type: Object, required: true } })
const busy = ref(false)
async function decide(decision) {
  if (busy.value) return
  busy.value = true
  const { id, title } = props.order
  const version = latestOrderVersion(props.order)
  try {
    let note = ''
    if (decision === 'return') {
      const response = await ElMessageBox.prompt('还需要改哪里？可以留一句给负责人。', '退回「' + title + '」', {
        confirmButtonText: '退回处理', cancelButtonText: '取消', inputType: 'textarea',
        inputValidator: value => (value || '').length <= 300 || '最多填写 300 个字'
      })
      note = response.value || ''
    }
    await reviewUrgency(id, version, decision, note)
    toast.success(decision === 'confirm' ? '已确认本次加急完成' : '已退回负责人的加急待办')
  } catch (err) {
    if (err === 'cancel' || err === 'close') return
    toast.error(err.message || '操作失败，请重试')
    await getOrder(id).catch(() => {})
  } finally { busy.value = false }
}
</script>
<style scoped>
.urgent-decisions { display:inline-flex; flex-wrap:wrap; gap:6px; align-items:center; }
.urgent-decisions :deep(.el-button) { margin:0; }
</style>
