<template>
  <div ref="composerEl" class="composer" data-paste-zone="沟通">
    <UploadFeedback :queue="queue" />
    <!-- 待发送附件预览 -->
    <div v-if="pending.length" class="pending">
      <template v-for="(a, i) in pending" :key="i">
        <div v-if="a.type === 'audio'" class="audio-chip">
          <el-icon><Microphone /></el-icon>
          <span>语音 {{ a.duration || 0 }}"</span>
          <el-icon class="rm" @click="remove(i)"><Close /></el-icon>
        </div>
        <MediaThumb v-else :item="a" :size="66" removable @remove="remove(i)" />
      </template>
    </div>

    <div class="row">
      <el-button circle :icon="Picture" title="图片 / 视频" @click="pickMedia" />
      <VoiceRecorder @recorded="onRecorded" />
      <ChatInput v-model="text" class="text" label="项目沟通消息" :rows="1" :busy="sending"
        placeholder="输入消息，回车发送…" @send="doSend" @files="addFiles" />
      <el-button type="primary" :icon="Promotion" :loading="sending" :disabled="!canSend" @click="doSend">
        发送
      </el-button>
    </div>

    <input ref="fileEl" type="file" accept="image/*,video/*" multiple class="hidden-input" @change="onFiles" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, toRefs } from 'vue'
import { registerPasteTarget } from '@/utils/paste'
import { Picture, Promotion, Microphone, Close } from '@element-plus/icons-vue'
import { chatAttachmentQueue } from '@/utils/attachmentQueue'
import UploadFeedback from '@/components/UploadFeedback.vue'
import ChatInput from '@/components/ChatInput.vue'
import MediaThumb from './MediaThumb.vue'
import VoiceRecorder from './VoiceRecorder.vue'
const props = defineProps({ draft: { type: Object, required: true } })
const emit = defineEmits(['send'])

const { text, files: pending, sending } = toRefs(props.draft)
const fileEl = ref(null)

const queue = chatAttachmentQueue(props.draft, true)
const canSend = computed(() => !sending.value && queue.tasks.length === 0 && (text.value.trim() || pending.value.length))

function pickMedia() {
  fileEl.value && fileEl.value.click()
}

function addFiles(files) {
  return queue.add(files)
}
async function onFiles(e) {
  await addFiles(Array.from(e.target.files || []))
  e.target.value = ''
}

// 粘贴交给 utils/paste.js：鼠标在沟通区域或光标在输入框里时，文字进输入框、图片 / 文件进待发送附件
const composerEl = ref(null)
let unregisterPaste = () => {}
onMounted(() => { unregisterPaste = registerPasteTarget(() => composerEl.value, addFiles) })
onBeforeUnmount(() => unregisterPaste())

function onRecorded(item) {
  return queue.add([item.file], {name: item.name, type: 'audio', duration: item.duration})
}

function remove(i) {
  pending.value.splice(i, 1)
}

function doSend() {
  if (!canSend.value) return
  emit('send')
}
</script>

<style scoped>
.composer {
  background: #fff;
  border-top: 1px solid #ebeef5;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0));
}
.pending {
  max-height: min(16vh, 105px);
  overflow: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.audio-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 66px;
  padding: 0 12px;
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;
}
.audio-chip .rm {
  cursor: pointer;
  color: #909399;
}
.audio-chip .rm:hover {
  color: #f56c6c;
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.text {
  flex: 1;
  min-width: 0;
}
.hidden-input {
  display: none;
}
</style>
