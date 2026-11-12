<template>
  <span ref="anchor" class="handoff-complete" @click.stop>
    <template v-if="asksForNote">
      <el-popover v-model:visible="open" trigger="click" placement="bottom-start" :width="290" :popper-style="layerStyle" :disabled="disabled"
        :persistent="false" @after-enter="focusField(input)">
        <template #reference>
          <el-button size="small" type="primary" :disabled="disabled || busy">{{ label || '做完了' }}</el-button>
        </template>
        <form class="handoff-note" aria-label="提交处理结果" @submit.prevent="send" @keydown.esc.stop="open = false">
          <label>做了什么？（可以不填，回车跳过）
            <input ref="input" v-model="note" maxlength="300" :disabled="busy" @keydown.enter="enter">
          </label>
          <div>
            <el-button size="small" :disabled="busy" @click="open = false">取消</el-button>
            <el-button size="small" type="primary" native-type="submit" :loading="busy">提交</el-button>
          </div>
        </form>
      </el-popover>
      <small v-if="item.turn?.requesterName">交给{{ item.turn.requesterName }}确认</small>
    </template>
    <el-button v-else size="small" type="primary" :loading="busy" :disabled="disabled" @click="send">{{ label || '完成' }}</el-button>
  </span>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { focusField } from '@/utils/formKeys'
import { getOrder, latestOrderVersion } from '@/mock/store'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { toast } from '@/utils/toast'

const props = defineProps({
  item: { type:Object, required:true }, submit:Function, disabled:Boolean, requestConfirm:Boolean, label:String
})
const emit = defineEmits(['done'])
const asksForNote = computed(() => !!props.item.turn || props.requestConfirm)
const open = ref(false)
const input = ref(null)
const anchor = ref(null)
const layerStyle = ref(null)
const note = ref('')
const busy = ref(false)
let version

watch(open, visible => {
  if (!visible) return
  note.value = ''
  // The floating notice sits above drawers. Keep its teleported editor above the notice.
  const notice = anchor.value?.closest('.issue-inbox-notice')
  layerStyle.value = notice ? { zIndex:Number(getComputedStyle(notice).zIndex) + 1 } : null
  version = latestOrderVersion(props.item.order)
}, { flush:'sync' })
function enter(event) {
  // Let an IME use Enter to accept its candidate without submitting the form.
  if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return }
  event.preventDefault()
  send()
}
async function send() {
  if (busy.value || props.disabled) return
  busy.value = true
  const { order, kind, bugId } = props.item
  try {
    const result = props.submit
      ? await props.submit(note.value.trim(), version)
      : await finishPendingWithUndo(order, kind, bugId, '已完成：' + order.title, note.value.trim(), open.value ? version : undefined)
    if (result === false) return
    open.value = false
    emit('done')
  } catch (error) {
    toast.error(error.message || '提交失败，请重试')
    await getOrder(order.id).catch(() => {})
    version = latestOrderVersion(order)
  } finally { busy.value = false }
}
</script>
<style scoped>
.handoff-complete {display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 7px;max-width:100%}
.handoff-complete small {color:#526781;font-size:12px}
.handoff-note {display:grid;gap:10px}
.handoff-note label {font-size:13px;color:#334762}
.handoff-note input {display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:8px;border:1px solid #b1c4dc;border-radius:5px;font:inherit}
.handoff-note div {display:flex;justify-content:flex-end}
@media(max-width:600px){.handoff-complete :deep(button),.handoff-note :deep(button){min-height:44px}.handoff-note input{font-size:16px}}
</style>
