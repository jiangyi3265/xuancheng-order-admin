<template>
  <div class="chat-input">
    <el-input ref="field" v-model="model" type="textarea" resize="none" :rows="rows"
      :autosize="{ minRows: rows, maxRows: 3 }" :maxlength="maxlength" :readonly="busy"
      :placeholder="placeholder" :aria-label="label" enterkeyhint="send"
      title="回车发送，Shift + 回车换行" @keydown="onKey" @keyup="keyLineBreak=false" @blur="keyLineBreak=false"
      @beforeinput="onBeforeInput" @compositionend="onCommit" />
    <el-popover placement="top-end" trigger="click" :width="260" v-model:visible="open">
      <template #reference>
        <button type="button" class="face-button" aria-label="选择表情或表情包" :disabled="busy" title="表情和表情包">☺</button>
      </template>
      <div class="palette" @keydown.esc.stop="open=false">
        <div class="emojis" aria-label="常用表情">
          <button v-for="emoji in emojis" :key="emoji" type="button" :aria-label="'插入'+emoji" @click="insert(emoji)">{{ emoji }}</button>
        </div>
        <div class="stickers" aria-label="表情包">
          <button v-for="sticker in stickers" :key="sticker.label" type="button" :aria-label="'添加表情包'+sticker.label"
            :style="{background:sticker.color}" @click="attachSticker(sticker)"><span>{{ sticker.face }}</span>{{ sticker.label }}</button>
        </div>
        <button class="custom" type="button" @click="customFiles.click()">选择自己的图片表情…</button>
      </div>
    </el-popover>
    <input ref="customFiles" type="file" accept="image/*" multiple hidden @change="onCustomFiles" />
  </div>
</template>

<script setup>
import { nextTick, ref } from 'vue'
const props = defineProps({
  busy: Boolean, label: String, placeholder: String, maxlength: Number, rows: {type: Number, default: 2}
})
const model = defineModel({type: String, default: ''})
const emit = defineEmits(['send', 'files'])
const field = ref(null), open = ref(false), customFiles = ref(null)
const emojis = ['😊','😂','👍','👌','🙏','❤️','🎉','🤝','👀','💪','🤔','🥳','👏','✅','💡','☕']
const stickers = [
  {label:'收到', face:'👌', color:'#dcf2ff'}, {label:'辛苦啦', face:'☕', color:'#fff0da'},
  {label:'没问题', face:'👍', color:'#dff5e4'}, {label:'谢谢', face:'🙏', color:'#ffe6eb'},
  {label:'马上看', face:'👀', color:'#ece9ff'}, {label:'搞定了', face:'🎉', color:'#fff1c4'}
]
let lastCommit = -Infinity
function onCommit() { lastCommit = performance.now() }
let keyLineBreak = false
function onKey(event) {
  keyLineBreak = event.key === 'Enter' && (event.shiftKey || event.altKey)
  if (event.key !== 'Enter' || keyLineBreak || event.isComposing || event.keyCode === 229 || field.value?.isComposing) return
  event.preventDefault()
  // Safari can dispatch the candidate-confirming key immediately after compositionend.
  if (!event.repeat && !props.busy && performance.now() - lastCommit > 35) emit('send')
}
// Some software keyboards provide only a beforeinput event for their send key.
function onBeforeInput(event) {
  if (!['insertLineBreak','insertParagraph'].includes(event.inputType) || keyLineBreak ||
      event.isComposing || field.value?.isComposing || !event.cancelable) return
  event.preventDefault()
  if (!props.busy && performance.now() - lastCommit > 35) emit('send')
}
async function insert(emoji) {
  if (props.busy) return
  const input = field.value.textarea
  const start = input.selectionStart, end = input.selectionEnd
  const value = model.value.slice(0, start) + emoji + model.value.slice(end)
  if (props.maxlength && value.length > props.maxlength) return
  model.value = value
  open.value = false
  await nextTick()
  input.focus({preventScroll:true})
  input.setSelectionRange(start + emoji.length, start + emoji.length)
}
// Send the same labelled reaction as a PNG through the normal chat attachment flow.
function attachSticker({label, face, color}) {
  if (props.busy) return
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 192, 192)
  ctx.textAlign = 'center'
  ctx.font = '84px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  ctx.fillText(face, 96, 106)
  ctx.font = 'bold 34px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillStyle = '#253653'
  ctx.fillText(label, 96, 161)
  const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0))
  emit('files', [new File([bytes], label + '.png', {type:'image/png'})])
  open.value = false
  field.value.focus()
}
function onCustomFiles(event) {
  const files = Array.from(event.target.files)
  if (!props.busy && files.length) emit('files', files)
  event.target.value = ''
  open.value = false
  field.value.focus()
}
</script>

<style scoped>
.chat-input{display:flex;align-items:flex-end;gap:4px;min-width:0}.chat-input>.el-textarea{flex:1;min-width:0}
.face-button{flex:none;border:1px solid #d9e3f1;background:#fff;color:#496485;border-radius:9px;width:34px;height:34px;line-height:1;font:24px/1 sans-serif;cursor:pointer}
.palette{display:grid;gap:10px;max-height:45vh;overflow:auto}.palette button{cursor:pointer;color:#26364d;border:0;border-radius:7px}
.emojis{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:2px}.emojis button{background:#fff;font-size:19px;padding:4px 0}.emojis button:hover,.emojis button:focus-visible{background:#edf4ff}
.stickers{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.stickers button{font-size:12px;font-weight:650;padding:5px}.stickers span{display:block;font-size:22px}.custom{background:#f2f6fc;padding:7px}
</style>
