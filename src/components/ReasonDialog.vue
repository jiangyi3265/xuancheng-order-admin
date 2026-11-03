<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="440px"
    append-to-body
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <div v-if="tip" class="rd-tip">{{ tip }}</div>
    <el-input
      ref="inputRef"
      v-model="reason"
      type="textarea"
      :rows="3"
      maxlength="500"
      show-word-limit
      resize="none"
      :placeholder="placeholder"
    />
    <div v-if="error" class="rd-error">{{ error }}</div>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button :type="danger ? 'danger' : 'primary'" :loading="saving" @click="confirm">{{ confirmText }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// 通用“写原因”小窗：交回、拒绝、退回返工、驳回申请都用它。原因必填；submit 失败时窗口保持打开并显示原因。
import { ref, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '请写原因' },
  tip: { type: String, default: '' },
  placeholder: { type: String, default: '写一下原因，对方会看到' },
  confirmText: { type: String, default: '确定' },
  danger: { type: Boolean, default: false },
  // async (reason) => void；抛错表示失败
  submit: { type: Function, required: true }
})
const emit = defineEmits(['update:visible'])

const reason = ref('')
const saving = ref(false)
const error = ref('')
const inputRef = ref(null)

function onOpen() {
  reason.value = ''
  error.value = ''
  nextTick(() => inputRef.value?.focus())
}

async function confirm() {
  const text = reason.value.trim()
  if (!text) {
    error.value = '请写一下原因'
    return
  }
  error.value = ''
  saving.value = true
  try {
    await props.submit(text)
    emit('update:visible', false)
  } catch (e) {
    error.value = e.message || '操作失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.rd-tip {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
  margin-bottom: 10px;
}
.rd-error {
  margin-top: 6px;
  font-size: 12px;
  color: #f56c6c;
}
</style>
