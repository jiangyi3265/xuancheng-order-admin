<template>
  <div class="att-view">
    <div v-if="mediaItems.length" class="thumbs">
      <MediaThumb v-for="(m, i) in mediaItems" :key="'m' + i" :item="m" :size="size" />
    </div>
    <div v-if="audioItems.length" class="audio-list">
      <div v-for="(a, i) in audioItems" :key="'a' + i" class="audio-row">
        <span class="a-label">🎤 {{ a.name || '语音' }}</span>
        <audio :src="a.url" controls preload="metadata"></audio>
      </div>
    </div>
    <div v-if="fileItems.length" class="file-list">
      <div v-for="(f, i) in fileItems" :key="'f' + i" class="file-row" @click="downloadAttachment(f)" :title="'下载 ' + f.name">
        <el-icon class="f-ico"><component :is="fileIcon(f.name)" /></el-icon>
        <span class="f-name">{{ f.name }}</span>
        <span class="f-size">{{ fmtSize(f.size) }}</span>
        <el-icon class="f-dl"><Download /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Download } from '@element-plus/icons-vue'
import MediaThumb from './MediaThumb.vue'
import { fmtSize, fileIcon, downloadAttachment } from '@/utils/file'

const props = defineProps({
  items: { type: Array, default: () => [] },
  size: { type: Number, default: 84 }
})

const mediaItems = computed(() => props.items.filter((x) => x.type === 'image' || x.type === 'video'))
const audioItems = computed(() => props.items.filter((x) => x.type === 'audio'))
const fileItems = computed(() => props.items.filter((x) => !['image', 'video', 'audio'].includes(x.type)))
</script>

<style scoped>
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.audio-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.audio-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.a-label {
  font-size: 13px;
  color: #e6a23c;
}
.audio-row audio {
  height: 36px;
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
  padding: 7px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.file-row:hover {
  background: #ecf5ff;
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
.f-dl {
  color: #409eff;
}
</style>
