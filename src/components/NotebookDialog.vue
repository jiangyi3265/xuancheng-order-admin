<template>
  <el-dialog
    :model-value="visible"
    :title="`📒 项目记事本 · ${order?.title || ''}`"
    width="720px"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="onClose"
    @open="onOpen"
  >
    <div v-loading="loading" class="notebook">
      <div class="tip">
        <el-icon><InfoFilled /></el-icon>
        随时记录客户说的话、需求、注意事项——仅总裁和副总裁可见，客户端不可见。图片可直接 <b>Ctrl+V</b> 粘贴，文档点 + 上传。
      </div>

      <el-input
        v-model="notes"
        type="textarea"
        :autosize="{ minRows: 10, maxRows: 20 }"
        resize="none"
        placeholder="例如：
· 6/20 客户微信说预算能加到 8000，但要求两周内上线
· 首页要参考 xxx 的风格，logo 待客户提供
· 已收定金 2000，尾款验收后付
· 待办：周三前给客户看初稿"
        @input="dirty = true"
      />

      <div class="att-block">
        <div class="att-label"><el-icon><Paperclip /></el-icon> 参考图 / 文档</div>
        <AttachmentUploader v-model="noteAttachments" :limit="30" @update:modelValue="dirty = true" />
      </div>
    </div>

    <template #footer>
      <span class="foot-hint">{{ savedHint }}</span>
      <el-button @click="onClose(false)">关闭</el-button>
      <el-button type="primary" :icon="Check" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled, Paperclip, Check } from '@element-plus/icons-vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import { getOrderNotes, saveOrderNotes } from '@/mock/store'

const props = defineProps({
  visible: { type: Boolean, default: false },
  order: { type: Object, default: null }
})
const emit = defineEmits(['update:visible'])

const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const notes = ref('')
const noteAttachments = ref([])
const savedHint = ref('')

async function onOpen() {
  if (!props.order) return
  loading.value = true
  dirty.value = false
  savedHint.value = ''
  try {
    const data = await getOrderNotes(props.order.id)
    notes.value = data?.notes || ''
    noteAttachments.value = data?.noteAttachments || []
  } catch (e) {
    ElMessage.error(e.message || '加载记事本失败')
  } finally {
    loading.value = false
    // 首次赋值会触发 input/update，重置脏标记
    setTimeout(() => (dirty.value = false), 0)
  }
}

async function save() {
  if (!props.order) return
  saving.value = true
  try {
    await saveOrderNotes(props.order.id, notes.value, noteAttachments.value)
    dirty.value = false
    savedHint.value = '已保存 ✓'
    ElMessage.success('记事本已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onClose() {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('记事本有改动尚未保存，确定关闭吗？', '未保存', {
        confirmButtonText: '直接关闭',
        cancelButtonText: '返回保存',
        type: 'warning'
      })
    } catch {
      return
    }
  }
  emit('update:visible', false)
}
</script>

<style scoped>
.notebook {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
  background: #f4f6f9;
  border-radius: 6px;
  padding: 8px 10px;
}
.tip b {
  color: #409eff;
}
.att-block {
  border-top: 1px dashed #ebeef5;
  padding-top: 12px;
}
.att-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 10px;
}
.foot-hint {
  float: left;
  color: #67c23a;
  font-size: 13px;
  line-height: 32px;
}
</style>
