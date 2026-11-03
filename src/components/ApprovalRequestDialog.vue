<template>
  <el-dialog
    :model-value="visible"
    :title="meta.title"
    width="440px"
    append-to-body
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <div class="ar-order">{{ order?.title }}</div>
    <div class="ar-tip">{{ meta.tip }}</div>

    <div v-if="type === 'amount'" class="ar-row">
      <span class="ar-label">现在报价</span>
      <b>{{ money(order?.amount) }}</b>
      <span class="ar-label ml">改成</span>
      <el-input-number v-model="newAmount" :min="0" :precision="2" :step="100" controls-position="right" style="width: 160px" />
    </div>

    <el-input
      ref="inputRef"
      v-model="reason"
      type="textarea"
      :rows="3"
      maxlength="500"
      show-word-limit
      resize="none"
      placeholder="写一下原因，老板会看到"
    />
    <div v-if="error" class="ar-error">{{ error }}</div>

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button :type="meta.danger ? 'danger' : 'primary'" :loading="saving" @click="confirm">提交申请</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// 员工申请改报价 / 取消 / 删除：提交后要老板批准才生效。
import { ref, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { requestApproval } from '@/mock/store'
import { money } from '@/utils/payment'

const props = defineProps({
  visible: { type: Boolean, default: false },
  order: { type: Object, default: null },
  type: { type: String, default: 'amount' } // amount / cancel / delete
})
const emit = defineEmits(['update:visible'])

const META = {
  amount: { title: '申请改报价', tip: '提交后要老板批准，批准了报价才会改。', danger: false },
  cancel: { title: '申请取消项目', tip: '提交后要老板批准，批准了项目才会被取消。', danger: true },
  delete: { title: '申请删除项目', tip: '提交后要老板批准，批准后项目会放进回收站。', danger: true }
}
const meta = computed(() => META[props.type] || META.amount)

const reason = ref('')
const newAmount = ref(0)
const saving = ref(false)
const error = ref('')
const inputRef = ref(null)

function onOpen() {
  reason.value = ''
  error.value = ''
  newAmount.value = Number(props.order?.amount) || 0
  nextTick(() => inputRef.value?.focus())
}

async function confirm() {
  if (!reason.value.trim()) {
    error.value = '请写一下申请原因'
    return
  }
  if (props.type === 'amount' && Number(newAmount.value) === (Number(props.order?.amount) || 0)) {
    error.value = '新报价和现在一样，不用申请'
    return
  }
  error.value = ''
  saving.value = true
  try {
    await requestApproval({
      orderId: props.order.id,
      type: props.type,
      reason: reason.value.trim(),
      payload: props.type === 'amount' ? { amount: Number(newAmount.value) } : {}
    })
    ElMessage.success('已提交，等老板批准')
    emit('update:visible', false)
  } catch (e) {
    error.value = e.message || '提交失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ar-order {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.ar-tip {
  font-size: 13px;
  color: #909399;
  margin-bottom: 12px;
}
.ar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}
.ar-label {
  color: #909399;
  font-size: 13px;
}
.ml {
  margin-left: 10px;
}
.ar-error {
  margin-top: 6px;
  font-size: 12px;
  color: #f56c6c;
}
</style>
