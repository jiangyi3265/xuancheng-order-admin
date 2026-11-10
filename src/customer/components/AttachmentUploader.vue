<template>
  <div ref="uploaderEl" class="att-uploader">
    <UploadFeedback :queue="queue" />
    <div class="thumbs">
      <DraftMediaThumb
        v-for="(m, i) in mediaItems"
        :key="'m' + i"
        :draft="draft" :item="m" :siblings="mediaItems"
        :size="84"
        @remove="removeItem(m)"
      />
      <button
        type="button" aria-label="添加图片或文件" :disabled="draft.sending"
        class="add-zone"
        :class="{ over: dragOver, uploading: queue.uploadingCount > 0 }"
        @click="pickFile"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        title="图片可直接 Ctrl+V 粘贴；视频/文件/压缩包点击或拖拽上传"
      >
        <el-icon :size="20" :class="{ spin: queue.uploadingCount > 0 }">
          <Loading v-if="queue.uploadingCount > 0" />
          <Plus v-else />
        </el-icon>
        <span class="az-text">{{ queue.uploadingCount > 0 ? '上传中' : chooseLabel }}</span>
      </button>
    </div>

    <div v-if="fileItems.length" class="file-list">
      <div v-for="(f, i) in fileItems" :key="'f' + i" class="file-row">
        <el-icon class="f-ico"><component :is="fileIcon(f.name)" /></el-icon>
        <span class="f-name" :title="f.name">{{ f.name }}</span>
        <span class="f-size">{{ fmtSize(f.size) }}</span>
        <button type="button" class="f-del" :disabled="draft.sending" :aria-label="'移除 ' + f.name" @click="removeItem(f)"><el-icon><Close /></el-icon></button>
      </div>
    </div>

    <div class="hint">
      <slot name="hint"><el-icon><InfoFilled /></el-icon>
      <span class="hint-pc">图片：截图后直接 <b>Ctrl+V</b> 粘贴；视频 / 文件 / 压缩包：点 + 或拖拽进来</span><span class="hint-m">点 + 选图片、视频或文件</span></slot>
    </div>

    <input ref="fileInput" type="file" multiple class="hidden-input" @change="onFileChange" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Plus, InfoFilled, Close, Loading } from '@element-plus/icons-vue'
import DraftMediaThumb from './DraftMediaThumb.vue'
import UploadFeedback from '@/components/UploadFeedback.vue'
import { fmtSize, fileIcon } from '@/customer/utils/file'
import { chatAttachmentQueue } from '@/utils/attachmentQueue'
import { registerPasteTarget } from '@/utils/paste'

const props = defineProps({
  draft: { type: Object, required: true },
  chooseLabel: { type: String, default: '粘贴 / 点击' }
})
const queue = chatAttachmentQueue(props.draft, true)
const mediaItems = computed(() => props.draft.files.filter(item => ['image', 'video'].includes(item.type)))
const fileItems = computed(() => props.draft.files.filter(item => !['image', 'video'].includes(item.type)))
const fileInput = ref(null)
const uploaderEl = ref(null)
const dragOver = ref(false)
let unregisterPaste = () => {}

function addFiles(files) {
  return queue.add(files)
}
function onDrop(e) {
  dragOver.value = false
  const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
  if (fs.length) addFiles(fs)
}
function pickFile() {
  fileInput.value && fileInput.value.click()
}
function onFileChange(e) {
  const fs = Array.from(e.target.files || [])
  addFiles(fs)
  e.target.value = ''
}
function removeItem(item) {
  if (props.draft.sending || props.draft.annotating) return
  const index = props.draft.files.indexOf(item)
  if (index >= 0) props.draft.files.splice(index, 1)
}

// 粘贴由 utils/paste.js 统一分发：鼠标所在区域 / 光标所在区域的图片、文件会交给这里
onMounted(() => { unregisterPaste = registerPasteTarget(() => uploaderEl.value, addFiles) })
onBeforeUnmount(() => unregisterPaste())

defineExpose({ addFiles })
</script>

<style scoped>
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.add-zone {
  background: transparent;
  font: inherit;
  width: 84px;
  height: 84px;
  border: 1px dashed #c0c4cc;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #909399;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.add-zone:hover,
.add-zone.over {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}
.add-zone.uploading {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}
.spin {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.az-text {
  font-size: 12px;
}
.file-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
}
.f-ico {
  color: #409eff;
  font-size: 16px;
}
.f-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #303133;
}
.f-size {
  color: #909399;
  font-size: 12px;
}
.f-del {
  border: 0;
  background: transparent;
  padding: 6px;
  color: #63738b;
  cursor: pointer;
}
.f-del:hover {
  color: #f56c6c;
}
/* 提示是一句连着的话：不用 flex（以前窄屏上被拆成三列，读不通） */
.hint {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
  margin-top: 8px;
}
.hint .el-icon {
  vertical-align: -2px;
  margin-right: 4px;
}
.hint-m {
  display: none;
}
@media (max-width: 768px) {
  .hint-pc { display: none; }
  .hint-m { display: inline; }
}
.hint b {
  color: #409eff;
}
.hidden-input {
  display: none;
}
</style>
