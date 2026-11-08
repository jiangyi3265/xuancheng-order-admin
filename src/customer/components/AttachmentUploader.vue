<template>
  <div ref="uploaderEl" class="att-uploader">
    <div class="thumbs">
      <MediaThumb
        v-for="(m, i) in mediaItems"
        :key="'m' + i"
        :item="m"
        :size="84"
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
        title="图片可直接 Ctrl+V 粘贴；视频/文件/压缩包点击或拖拽上传"
      >
        <el-icon :size="20" :class="{ spin: uploadingCount > 0 }">
          <Loading v-if="uploadingCount > 0" />
          <Plus v-else />
        </el-icon>
        <span class="az-text">{{ uploadingCount > 0 ? '上传中' : '粘贴 / 点击' }}</span>
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

    <div class="hint">
      <el-icon><InfoFilled /></el-icon>
      图片：截图后直接 <b>Ctrl+V</b> 粘贴；视频 / 文件 / 压缩包：点 + 或拖拽进来
    </div>

    <input ref="fileInput" type="file" multiple class="hidden-input" @change="onFileChange" />
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { Plus, InfoFilled, Close, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MediaThumb from './MediaThumb.vue'
import { attType, extOf, fmtSize, fileIcon } from '@/customer/utils/file'
import { uploadAttachment } from '@/customer/utils/upload'

import { registerPasteTarget } from '@/utils/paste'
const uploaderEl = ref(null)
let unregisterPaste = () => {}

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // 默认不限张数；个别地方真需要上限时再传
  limit: { type: Number, default: Infinity }
})
const emit = defineEmits(['update:modelValue'])

const list = ref([])
const fileInput = ref(null)
const dragOver = ref(false)
const uploadingCount = ref(0)

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

// 张数不限；一次并发传 3 个，比一张张排队快，传完按选择的顺序放回
const UPLOAD_CONCURRENCY = 3
async function addFiles(files) {
  const queue = []
  for (const f of files) {
    if (list.value.length + uploadingCount.value + queue.length >= props.limit) {
      ElMessage.warning(`最多 ${props.limit} 个附件`)
      break
    }
    if (f.size > 50 * 1024 * 1024) {
      ElMessage.warning(`「${f.name}」不能超过 50MB`)
      continue
    }
    queue.push(f)
  }
  for (let i = 0; i < queue.length; i += UPLOAD_CONCURRENCY) {
    const batch = queue.slice(i, i + UPLOAD_CONCURRENCY)
    uploadingCount.value += batch.length
    const results = await Promise.allSettled(batch.map((f) => uploadAttachment(f)))
    uploadingCount.value -= batch.length
    results.forEach((r, j) => {
      const f = batch[j]
      if (r.status === 'fulfilled') list.value.push({ ...r.value, type: attType(f.type, f.name), ext: extOf(f.name) || r.value.ext })
      else ElMessage.error(r.reason?.message || '附件上传失败')
    })
    emitValue()
  }
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
.hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
.hint b {
  color: #409eff;
}
.hidden-input {
  display: none;
}
</style>
