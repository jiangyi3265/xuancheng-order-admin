<template>
  <div class="draft-media">
    <MediaThumb v-if="!reference" :item="item" :siblings="siblings" :size="size" :removable="!draft.sending && !draft.annotating" @remove="$emit('remove')" />
    <button v-if="canAnnotate" ref="trigger" type="button" class="annotate" :disabled="draft.sending || !!draft.annotating"
      :aria-label="reference ? '圈注改后图' : '圈注 ' + (item.name || '图片')" @click="openEditor">
      <el-icon aria-hidden="true"><EditPen /></el-icon>{{ reference ? '圈注改后图' : '圈注' }}
    </button>
    <ImageAnnotationEditor v-if="edit" :item="edit.image" :busy="saving" :error="error"
      @close="closeEditor" @save="saveImage" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MediaThumb from './MediaThumb.vue'
import { customerToken } from '@/customer/mock/store'
import { extOf } from '@/customer/utils/file'
import { uploadAttachment } from '@/customer/utils/upload'

import ImageAnnotationEditor from './ImageAnnotationEditor.vue'

const props = defineProps({
  draft: {type:Object, required:true},
  item: {type:Object, required:true},
  siblings: Array,
  reference: Boolean,
  size: {type:Number, default:84}
})
defineEmits(['remove'])

const editableRaster = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'avif'])
const canAnnotate = computed(() => props.item.type === 'image' && editableRaster.has(
  (props.item.ext || extOf(props.item.name) || extOf(props.item.url?.split('?')[0])).toLowerCase()
))
const edit = shallowRef(null)
const trigger = ref(null)
const saving = ref(false)
const error = ref('')
let mounted = true

function openEditor() {
  const draft = props.draft
  if (draft.sending || draft.annotating || (!props.reference && !draft.files.includes(props.item))) return
  const lock = Symbol('圈注中的附件')
  draft.annotating = lock
  edit.value = {image:props.item, draft, lock, owner:customerToken.value, reference:props.reference}
  error.value = ''
}
function current(target) {
  return target.owner && target.owner === customerToken.value && target.owner === localStorage.getItem('customerToken')
    && target.draft.annotating === target.lock && (target.reference || target.draft.files.includes(target.image))
}
function finish(target, focusUrl) {
  if (target.draft.annotating === target.lock) target.draft.annotating = false
  if (edit.value === target) edit.value = null
  if (focusUrl && mounted) nextTick(() => {
    if (mounted && props.item.url === focusUrl && !trigger.value?.disabled) trigger.value?.focus({preventScroll:true})
  })
}
function closeEditor() {
  if (!saving.value && edit.value) finish(edit.value, edit.value.image.url)
}
async function saveImage(file) {
  const target = edit.value
  if (!target || saving.value) return
  if (!current(target)) return finish(target)
  saving.value = true
  error.value = ''
  try {
    const marked = await uploadAttachment(file, {blockOtherForms:false})
    if (!marked.url) throw new Error('圈注图片上传未完成，请重试')
    if (!current(target)) return finish(target)
    const annotation = {...marked, type:'image', ext:extOf(file.name), annotated:true}
    if (target.reference) {
      // The team's comparison image stays on its original review round.
      target.draft.files.push(annotation)
    } else {
      // Earlier uploads can still use this attachment as their insertion anchor.
      Object.assign(target.image, annotation)
    }
    finish(target, target.reference ? target.image.url : marked.url)
  } catch (err) {
    if (mounted && current(target)) error.value = err.message || '圈注上传失败，请重试'
    else {
      if (current(target)) ElMessage.error('「' + target.image.name + '」的圈注未保存')
      finish(target)
    }
  } finally {
    saving.value = false
  }
}

// A draft can be cleared by logging out in another tab while the editor is open.
watch(() => edit.value && !current(edit.value), stale => {
  if (stale && edit.value) finish(edit.value)
})
onBeforeUnmount(() => {
  mounted = false
  // A save already requested belongs to the original draft, even after navigation.
  closeEditor()
})
</script>

<style scoped>
.draft-media {display:flex;flex-direction:column;align-items:stretch;align-self:flex-start;min-width:0}
.annotate {display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:28px;margin-top:3px;padding:2px 4px;border:1px solid #d6e3f6;border-radius:7px;background:#f3f7fe;color:#2055a4;font:600 12px/1.3 system-ui;cursor:pointer}
.annotate:not(:disabled):hover {background:#e4efff;border-color:#98b9e8}
.annotate:focus-visible {outline:2px solid #326abd;outline-offset:1px}
.annotate:disabled {opacity:.55;cursor:default}
@media(pointer:coarse){.annotate{min-height:32px}}
</style>
