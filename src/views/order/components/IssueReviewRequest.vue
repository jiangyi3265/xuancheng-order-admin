<template>
  <el-dialog :model-value="true" :title="bug.customerConfirm ? '已处理，请客户确认' : '请客户确认'" class="issue-review-dialog" width="440px"
    align-center append-to-body :close-on-click-modal="false" :before-close="close">
    <form class="review-form" data-paste-zone="请客户确认" @submit.prevent="submit">
      <p class="review-subject">#{{ bug.id }} · {{ bug.content || '截图需求' }}</p>
      <fieldset :disabled="draft.sending" :inert="draft.sending || undefined">
        <div v-if="originals.length" class="field">
          <span id="review-original-label">改前截图</span>
          <div class="originals" role="group" aria-labelledby="review-original-label">
            <button v-for="(image,index) in originals" :key="image.url" type="button"
              :aria-label="'选择改前截图 '+(index+1)+' '+(image.name || '')" :aria-pressed="beforeUrl===image.url"
              @click="beforeUrl=image.url">
              <img :src="image.url" alt="" loading="lazy" />
            </button>
          </div>
        </div>
        <div class="field"><span>改后截图</span>
          <AttachmentUploader v-model="draft.files" :draft="draft" :limit="1" images-only compact />
          <small v-if="draft.files.some(item => item.type !== 'image')" class="form-error" role="alert">请移除该文件，重新选择截图。</small>
        </div>
        <div class="field"><label for="review-note">修改说明</label>
          <textarea id="review-note" v-model="draft.text" aria-label="修改说明" rows="2"
            maxlength="2000" placeholder="选填：写一句改了什么，或上传改后截图；都不填，客户看到「请确认这次修改」" />
        </div>
      </fieldset>
      <p v-if="stale" class="form-error" role="status">这条需求的确认状态已更新，请返回查看。</p>
      <p v-else-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="review-submit">
        <el-button :disabled="draft.sending" @click="close">取消</el-button>
        <el-button type="primary" native-type="submit" :loading="draft.sending" :disabled="!ready">{{ bug.customerConfirm ? '发给客户确认' : '发送确认请求' }}</el-button>
      </div>
    </form>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import { chatDraft, sendDraft } from '@/utils/chatDraft'
import { requestIssueReview } from '@/mock/store'

const props = defineProps({order:{type:Object,required:true}, bug:{type:Object,required:true}})
const emit = defineEmits(['close'])
const previousReviewId = props.bug.review?.id || null
const draft = chatDraft('issue-review',props.order.id,[props.bug.id,previousReviewId].join('-'))
const originals = computed(() => {
  const files = [...(props.bug.attachments || []),
    ...(props.bug.updates || []).filter(reply=>reply.senderKind==='customer').flatMap(reply=>reply.attachments || [])]
  const images = new Map()
  for (const file of files) if (file.type==='image' && file.url) images.set(file.url,file)
  return [...images.values()]
})
function initialImage() {
  try {
    const stored = JSON.parse(draft.retry?.fingerprint || '{}').beforeUrl
    if (originals.value.some(file => file.url === stored)) return stored
  } catch { /* A previously saved draft can have an older payload format. */ }
  return originals.value[0]?.url || ''
}
const beforeUrl = ref(initialImage())
const error = ref('')
const stale = computed(() => (props.bug.review?.id || null)!==previousReviewId || props.bug.status==='confirm' ||
  !props.order.customerAccount || ['done','cancelled'].includes(props.order.status))
const ready = computed(() => !stale.value && !draft.sending && !draft.uploading && !draft.attachmentWaitList.length &&
  draft.files.every(item => item.type === 'image'))
function close() {
  if (!draft.sending) emit('close')
}
async function submit() {
  if (!ready.value) return
  error.value = ''
  try {
    const saved = await sendDraft(draft, ({content,attachments}) => {
      const payload = {previousReviewId, beforeUrl:beforeUrl.value || undefined, afterImage:attachments[0] || null, content}
      const fingerprint = JSON.stringify(payload)
      if (draft.retry?.fingerprint !== fingerprint) {
        draft.retry = {fingerprint,key:crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')}
      }
      return requestIssueReview(props.bug.id,{...payload,requestKey:draft.retry.key})
    }, {allowEmpty:true})
    if (saved) {
      ElMessage.success(props.bug.customerConfirm ? '已处理，等客户确认' : '已请客户确认')
      emit('close')
    }
  } catch (e) {
    error.value = e.message || '发送失败，内容已保留'
  }
}
</script>

<style scoped>
.review-form {display:grid;gap:16px;color:#233a56}
.review-subject {margin:0;color:#566a82;overflow-wrap:anywhere;line-height:1.45;max-height:65px;overflow:auto}
fieldset {border:0;padding:0;margin:0;min-width:0;display:grid;gap:15px}
.field {display:grid;gap:6px;font-size:14px;font-weight:600}
.originals {display:flex;gap:6px;overflow:auto;padding:2px}
.originals button {padding:2px;width:52px;height:52px;flex:none;border:1px solid #d7e0ec;border-radius:7px;background:#f7f9fc;cursor:pointer}
.originals button[aria-pressed=true] {border:2px solid #2867d4}.originals img {display:block;width:100%;height:100%;object-fit:contain}
textarea {box-sizing:border-box;resize:vertical;min-height:54px;width:100%;padding:8px 10px;border:1px solid #cedbea;border-radius:8px;color:#263d56;font-family:inherit;font-size:14px;font-weight:400;line-height:1.45}
.form-error {margin:0;font-size:13px;color:#a72d26}.review-submit {display:flex;justify-content:flex-end;gap:8px}
</style>
<style>
.el-dialog.issue-review-dialog {max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto}
</style>
