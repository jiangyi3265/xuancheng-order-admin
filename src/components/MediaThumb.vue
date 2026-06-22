<template>
  <div class="media-thumb" :style="{ width: size + 'px', height: size + 'px' }">
    <div v-if="isVideo" class="vid" @click="playing = true">
      <video :src="item.url" class="m-el" muted preload="metadata"></video>
      <span class="play-badge"><el-icon :size="Math.round(size / 3)"><VideoPlay /></el-icon></span>
    </div>
    <el-image
      v-else
      :src="item.url"
      :preview-src-list="[item.url]"
      fit="cover"
      class="m-el"
      preview-teleported
    />

    <span v-if="removable" class="m-del" @click.stop="$emit('remove')">
      <el-icon><Close /></el-icon>
    </span>

    <el-dialog
      v-if="isVideo"
      v-model="playing"
      :title="item.name || '视频'"
      width="640px"
      align-center
      append-to-body
      destroy-on-close
    >
      <video :src="item.url" controls autoplay style="width: 100%; max-height: 70vh; border-radius: 6px; background: #000"></video>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { VideoPlay, Close } from '@element-plus/icons-vue'

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
