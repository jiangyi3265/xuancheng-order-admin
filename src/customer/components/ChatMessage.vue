<template>
  <!-- 系统提示（创建 / 状态变更）：居中灰字 -->
  <div v-if="isSystem" class="sys">
    <span><LinkText :text="item.content"/></span>
    <em>{{ item.time }}</em>
  </div>

  <!-- 聊天气泡 -->
  <div v-else class="msg" :class="{ mine }">
    <div class="avatar">{{ avatarText }}</div>
    <div class="body">
      <div v-if="showMeta" class="meta">
        <span class="name">{{ mine ? '我' : item.user }}</span>
        <time class="time" :title="fmtTime(item.time)">{{ friendlyTime(item.time) }}</time>
      </div>
      <div class="bubble">
        <div v-if="item.content" class="text"><LinkText :text="item.content"/></div>

        <div v-if="mediaItems.length" class="media">
          <MediaThumb v-for="(m, i) in mediaItems" :key="'m' + i" :item="m" :siblings="mediaItems" :size="120" />
        </div>

        <div v-for="(a, i) in audioItems" :key="'a' + i" class="audio">
          <audio :src="a.url" controls preload="metadata"></audio>
        </div>

        <a
          v-for="(f, i) in fileItems"
          :key="'f' + i"
          class="file"
          :href="f.url"
          :download="f.name"
        >
          <el-icon><Document /></el-icon>{{ f.name }}
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import LinkText from '@/components/LinkText.vue'
import { friendlyTime, fmtTime } from '@/utils/time'
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'
import MediaThumb from './MediaThumb.vue'
import { SYSTEM_TYPES } from '@/customer/constants/options'

const props = defineProps({
  item: { type: Object, required: true },
  showMeta: { type: Boolean, default: true },
  mine: { type: Boolean, default: false }
})

const isSystem = computed(() => SYSTEM_TYPES.includes(props.item.type))
const atts = computed(() => props.item.attachments || [])
const mediaItems = computed(() => atts.value.filter((a) => a.type === 'image' || a.type === 'video'))
const audioItems = computed(() => atts.value.filter((a) => a.type === 'audio'))
const fileItems = computed(() => atts.value.filter((a) => !['image', 'video', 'audio'].includes(a.type)))
const avatarText = computed(() => (props.mine ? '我' : (props.item.user || '成')).slice(0, 1))
</script>

<style scoped>
.sys {
  text-align: center;
  margin: 12px 0;
  color: #a8abb2;
  font-size: 12px;
}
.sys em {
  margin-left: 6px;
  font-style: normal;
  color: #c8cad0;
}
.msg {
  display: flex;
  gap: 8px;
  margin: 14px 0;
  align-items: flex-start;
}
.msg.mine {
  flex-direction: row-reverse;
}
.avatar {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}
.msg.mine .avatar {
  background: #67c23a;
}
.body {
  max-width: 74%;
  display: flex;
  flex-direction: column;
}
.meta {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
  font-size: 12px;
}
.msg.mine .meta {
  flex-direction: row-reverse;
}
.name {
  color: #606266;
  font-weight: 600;
}
.time {
  color: #c0c4cc;
}
.bubble {
  background: #fff;
  border-radius: 8px;
  padding: 9px 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  word-break: break-word;
}
.msg.mine .bubble {
  background: #95ec69;
}
.text {
  font-size: 15px;
  line-height: 1.5;
  color: #303133;
  white-space: pre-wrap;
}
.media {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.audio {
  margin-top: 6px;
}
.audio audio {
  height: 38px;
  max-width: 240px;
}
.file {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
  color: #409eff;
  text-decoration: none;
}
</style>
