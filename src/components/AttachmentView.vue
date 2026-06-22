<template>
  <div class="att-view">
    <div v-if="mediaItems.length" class="thumbs">
      <MediaThumb v-for="(m, i) in mediaItems" :key="'m' + i" :item="m" :size="size" />
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
const fileItems = computed(() => props.items.filter((x) => x.type === 'file'))
</script>

<style scoped>
.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
