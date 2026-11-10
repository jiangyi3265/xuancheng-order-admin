<template>
  <div ref="uploaderEl" class="att-uploader" :class="{ compact }">
    <UploadFeedback v-if="reliable || draft" :queue="queue" />
    <div class="thumbs">
      <MediaThumb
        v-for="(m, i) in mediaItems"
        :key="'m' + i"
        :item="m" :siblings="mediaItems"
        :size="compact ? 56 : 84"
        removable
        @remove="removeItem(m)"
      />
      <div
        v-if="list.length < limit"
        class="add-zone"
        :class="{ over: dragOver, uploading: uploadingCount > 0 }"
        @click="pickFile"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
        :title="imagesOnly ? '选择、粘贴或拖入图片' : '图片可直接 Ctrl+V 粘贴；视频/文件/压缩包点击或拖拽上传'"
        :aria-label="imagesOnly ? '添加截图' : compact ? '添加附件' : undefined"
        tabindex="0" @keydown.enter.prevent="pickFile" @keydown.space.prevent="pickFile"
        role="button"
      >
        <el-icon :size="20" :class="{ spin: uploadingCount > 0 }">
          <Loading v-if="uploadingCount > 0" />
          <Plus v-else />
        </el-icon>
        <span class="az-text">{{ uploadingCount > 0 ? '上传中' : imagesOnly ? '截图' : compact ? '附件' : '粘贴 / 点击' }}</span>
      </div>
    </div>

    <div v-if="fileItems.length" class="file-list">
      <div v-for="(f, i) in fileItems" :key="'f' + i" class="file-row">
        <el-icon class="f-ico"><component :is="fileIcon(f.name)" /></el-icon>
        <span class="f-name" :title="f.name">{{ f.name }}</span>
        <span class="f-size">{{ fmtSize(f.size) }}</span>
        <el-icon class="f-del" @click="removeItem(f)"><Close /></el-icon>
      </div>
    </div>

    <div v-if="!compact" class="hint">
      <el-icon><InfoFilled /></el-icon>
      <span class="hint-pc">图片：截图后直接 <b>Ctrl+V</b> 粘贴；视频 / 文件 / 压缩包：点 + 或拖拽进来</span><span class="hint-m">点 + 选图片、视频或文件</span>
    </div>

    <input ref="fileInput" type="file" :multiple="limit > 1" :accept="imagesOnly ? 'image/*' : undefined" class="hidden-input" @change="onFileChange" />
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { Plus, InfoFilled, Close, Loading } from '@element-plus/icons-vue'
import { toast as ElMessage } from '@/utils/toast'
import MediaThumb from './MediaThumb.vue'
import { attType, extOf, fmtSize, fileIcon } from '@/utils/file'
import { uploadAttachment } from '@/utils/upload'

import { attachmentQueue, chatAttachmentQueue } from '@/utils/attachmentQueue'
import UploadFeedback from './UploadFeedback.vue'
import { registerPasteTarget } from '@/utils/paste'
const uploaderEl = ref(null)
let unregisterPaste = () => {}

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // 默认不限张数；个别地方真需要上限时再传
  limit: { type: Number, default: Infinity },
  // 紧凑模式：聊天 / 记录输入框下用，只留一个小「+ 附件」按钮，提示放到鼠标悬停里
  compact: Boolean,
  reliable: Boolean,
  imagesOnly: Boolean,
  draft: Object
})
const emit = defineEmits(['update:modelValue'])

const list = ref([])
const fileInput = ref(null)
const dragOver = ref(false)
const queue = props.draft ? chatAttachmentQueue(props.draft) : attachmentQueue({
  keepFailures: props.reliable,
  session: () => localStorage.getItem('token') || localStorage.getItem('customerToken'),
  upload: async file => {
    const result = await uploadAttachment(file)
    return {...result, type: attType(file.type, file.name), ext: extOf(file.name) || result.ext}
  },
  getFiles: () => list.value,
  setFiles: items => {
    list.value = items
    emitValue()
  },
  reportError: message => ElMessage.error(message)
})
const uploadingCount = computed(() => queue.uploadingCount)
const failedCount = computed(() => queue.failedCount)

const mediaItems = computed(() => list.value.filter((x) => x.type === 'image' || x.type === 'video'))
const fileItems = computed(() => list.value.filter((x) => x.type === 'file'))

watch(
  () => props.modelValue,
  (v) => {
    list.value = (v || []).map((x) => ({ ...x }))
  },
  { immediate: true }
)

function emitValue() {
  emit('update:modelValue', list.value.map((x) => ({ ...x })))
}

function addFiles(files) {
  if (props.imagesOnly) {
    const images = Array.from(files).filter(file => attType(file.type,file.name) === 'image')
    if (images.length !== files.length) ElMessage.warning('请选择图片文件')
    files = images
  }
  const available = Math.max(0, props.limit - list.value.length - queue.tasks.length)
  if (files.length > available) ElMessage.warning(`最多 ${props.limit} 个附件`)
  return queue.add(Array.from(files).slice(0, available))
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
  const idx = list.value.indexOf(item)
  if (idx > -1) {
    list.value.splice(idx, 1)
    emitValue()
  }
}

// 粘贴由 utils/paste.js 统一分发：鼠标所在区域 / 光标所在区域的图片、文件会交给这里
onMounted(() => { unregisterPaste = registerPasteTarget(() => uploaderEl.value, addFiles) })
onBeforeUnmount(() => {
  unregisterPaste()
  if (!props.draft) queue.dispose()
})

defineExpose({ addFiles, uploadingCount, failedCount })
</script>

<style scoped>
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.add-zone {
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
  pointer-events: none;
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
  color: #c0c4cc;
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
.compact .add-zone {
  width: auto;
  height: 28px;
  flex-direction: row;
  padding: 0 10px;
  gap: 4px;
  border-radius: 14px;
}
.compact .add-zone .el-icon {
  font-size: 14px !important;
}
.compact .file-list {
  margin-top: 6px;
}
.hidden-input {
  display: none;
}
</style>
