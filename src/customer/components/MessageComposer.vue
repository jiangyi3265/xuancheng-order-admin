<template>
  <div ref="composerEl" class="composer" :class="{'issue-composer': issue}" :data-paste-zone="issue ? '补充这条需求' : '沟通'">
    <div v-if="adjusting || reviewing" class="adjust-intent">
      <span>{{ reviewing ? '调整说明' : '发送说明后将重新打开这条需求' }}</span>
      <DraftMediaThumb v-if="reviewing && referenceImage" reference :item="referenceImage" :draft="draft" />
      <button type="button" :disabled="sending || !!draft.annotating" @click="$emit('cancel-adjust')">取消调整</button>
    </div>
    <UploadFeedback :queue="queue" />
    <!-- 待发送附件预览 -->
    <div v-if="pending.length" class="pending">
      <template v-for="(a, i) in pending" :key="i">
        <div v-if="a.type === 'audio' || a.type === 'file'" class="file-chip">
          <el-icon><Microphone v-if="a.type === 'audio'" /><Document v-else /></el-icon>
          <span :title="a.name">{{ a.duration ? '语音 ' + a.duration + ' 秒' : a.name }}</span>
          <button class="rm" type="button" :disabled="sending" :aria-label="'移除 ' + a.name" @click="remove(i)"><el-icon><Close /></el-icon></button>
        </div>
        <DraftMediaThumb v-else :item="a" :draft="draft" :siblings="pending" :size="66" @remove="remove(i)" />
      </template>
    </div>

    <div class="row">
      <el-button circle :icon="Paperclip" title="添加图片、视频或文件" aria-label="添加图片、视频或文件" :disabled="sending" @click="pickFile" />
      <VoiceRecorder v-if="!issue" @recorded="onRecorded" />
      <ChatInput v-model="text" class="text" :label="reviewing ? '调整说明' : issue ? '补充这条需求' : '项目沟通消息'" :rows="1" :busy="sending"
        :placeholder="reviewing ? '写下要调整的地方，或附上截图…' : issue ? '补充这条需求…' : '输入消息，回车发送…'" @send="doSend" @files="addFiles" />
      <el-button type="primary" :icon="Promotion" :loading="sending" :disabled="!canSend" @click="doSend">
        {{ reviewing ? '提交调整' : '发送' }}
      </el-button>
    </div>

    <input ref="fileEl" type="file" multiple class="hidden-input" @change="onFiles" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, toRefs } from 'vue'
import { registerPasteTarget } from '@/utils/paste'
import { Paperclip, Document, Promotion, Microphone, Close } from '@element-plus/icons-vue'
import { chatAttachmentQueue } from '@/utils/attachmentQueue'
import UploadFeedback from '@/components/UploadFeedback.vue'
import ChatInput from '@/components/ChatInput.vue'
import DraftMediaThumb from './DraftMediaThumb.vue'
import VoiceRecorder from './VoiceRecorder.vue'
const props = defineProps({ draft: { type: Object, required: true }, issue: Boolean, adjusting: Boolean, reviewing: Boolean, referenceImage: Object, blocked: Boolean })
const emit = defineEmits(['send','cancel-adjust'])

const { text, files: pending, sending } = toRefs(props.draft)
const fileEl = ref(null)

const queue = chatAttachmentQueue(props.draft, true)
const canSend = computed(() => !props.blocked && !props.draft.annotating && !sending.value && queue.tasks.length === 0 && (text.value.trim() || pending.value.length))

function pickFile() {
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
  if (props.draft.sending || props.draft.annotating) return
  pending.value.splice(i, 1)
}

defineExpose({focus: () => composerEl.value?.querySelector('textarea')?.focus({preventScroll:true})})

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
.file-chip {
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
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
.file-chip span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-chip .rm {
  border: 0; padding: 5px; background: transparent; display: inline-flex;
  cursor: pointer;
  color: #909399;
}
.file-chip .rm:hover {
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
.issue-composer {flex:none;max-height:min(42dvh,345px);overflow:auto;box-sizing:border-box;padding:9px max(12px,calc((100% - 960px)/2)) max(9px,env(safe-area-inset-bottom));}
.adjust-intent {display:flex;align-items:center;justify-content:space-between;gap:8px;color:#71470b;font-size:13px;margin-bottom:7px;}
.adjust-intent button {border:0;border-radius:6px;padding:5px 8px;background:#fff2da;color:#73470b;cursor:pointer;font:inherit;}
</style>
