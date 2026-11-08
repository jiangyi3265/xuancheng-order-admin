<template>
  <div class="media-thumb" :style="{ width: size + 'px', height: size + 'px' }">
    <div v-if="isVideo" class="vid" @click="playing = true">
      <video :src="item.url" class="m-el" muted preload="metadata"></video>
      <span class="play-badge"><el-icon :size="Math.round(size / 3)"><VideoPlay /></el-icon></span>
    </div>
    <button v-else type="button" class="thumb-open" :aria-label="'放大' + (item.name || '图片')"
      @click.stop="openImage(item.url,item.name,item)" @keydown.enter.stop @keydown.space.stop>
      <el-image :src="item.url" alt="" fit="cover" class="m-el">
        <template #placeholder><span class="thumb-status">加载中</span></template>
        <template #error><span class="thumb-status">加载失败</span></template>
      </el-image>
    </button>

    <span v-if="removable" class="m-del" @click.stop="$emit('remove')">
      <el-icon><Close /></el-icon>
    </span>

    <el-dialog
      v-model="playing"
      :title="item.name || '附件预览'"
      width="640px"
      align-center
      append-to-body
      destroy-on-close
    >
      <video :src="item.url" controls autoplay class="attachment-preview"></video>
      <div class="attachment-meta"><el-icon><Document /></el-icon><div><strong>{{ item.name || '项目附件' }}</strong><p>{{ isVideo ? '视频' : '图片' }} · {{ fmtSize(item.size) }}</p></div></div>
      <template #footer><el-button @click="playing=false">返回项目</el-button><el-button type="primary" @click="downloadAttachment(item)">下载文件</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { openImage } from '@/utils/imagePreview'
import { ref, computed } from 'vue'
import { fmtSize, downloadAttachment } from '@/utils/file'
import { VideoPlay, Close, Document } from '@element-plus/icons-vue'

const props = defineProps({
  item: { type: Object, required: true },
  size: { type: Number, default: 84 },
  removable: { type: Boolean, default: false }
})
defineEmits(['remove'])

const playing = ref(false)
const isVideo = computed(
  () =>
    props.item.type === 'video' ||
    /^data:video\//.test(props.item.url || '') ||
    /\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(props.item.url || '')
)
</script>

<style scoped>
.media-thumb {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
  flex: 0 0 auto;
}
.vid {
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.thumb-open {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: #edf1f7;
  cursor: zoom-in;
}
.thumb-open:focus-visible { outline: 2px solid #326abd; outline-offset: -2px }
.thumb-open .m-el { background: transparent }
.thumb-open :deep(.el-image__wrapper) { pointer-events: none }
.thumb-open :deep(.el-image__inner.is-loading) { opacity: 1 }
.thumb-status {
  position: absolute;
  inset: auto 0 0;
  padding: 3px 1px;
  background: #203145d6;
  color: white;
  font-size: 11px;
  line-height: 1.25;
  text-align: center;
}
.m-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #000;
}
.play-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.m-del {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  z-index: 2;
}
.m-del:hover {
  background: #f56c6c;
}
</style>
