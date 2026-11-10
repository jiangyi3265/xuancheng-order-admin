<template>
  <section class="conversation" aria-label="报价沟通">
    <div class="thread-heading"><h3>沟通记录</h3><span>{{ quote.status==='converted' ? '已转项目 · 记录保留' : '仅报价双方可见' }}</span></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"><button type="button" @click="load()">重新加载</button></el-alert>
    <div ref="logEl" class="thread-log" role="log" aria-live="polite" @scroll.passive="onScroll" :aria-busy="initialLoading">
      <el-button v-if="more" size="small" class="older" :loading="paging" @click="earlier">查看更早记录</el-button>
      <p v-if="initialLoading" class="empty-thread">正在加载沟通记录…</p>
      <p v-else-if="!items.length && !error" class="empty-thread">还没有沟通记录。可以从需求、交付范围或工期聊起。</p>
      <article v-for="m in items" :key="m.id" :class="{mine:m.authorId===currentMember.id}">
        <div class="byline">{{ m.authorName }} <time :title="fmtTime(m.createdAt)">{{ friendlyTime(m.createdAt) || '历史报价' }}</time></div>
        <div class="bubble">
          <strong v-if="m.kind==='price'" class="price">报价 {{ money(m.amount, 2) }}</strong>
          <p v-if="m.content"><LinkText :text="m.content"/></p>
          <AttachmentView v-if="m.attachments?.length" :items="m.attachments" :size="64"/>
        </div>
      </article>
    </div>
    <button v-if="newBelow" type="button" class="jump-to-reply" @click="jumpToLatest">查看新回复 ↓</button>
    <form v-if="quote.status!=='converted'" class="composer" data-paste-zone="报价回复" @submit.prevent="send">
      <ChatInput v-model="message" label="回复内容" :maxlength="5000" :busy="sending" :rows="1" placeholder="写回复，回车发送，Shift + 回车换行" @send="send" @files="files => uploader?.addFiles(files)"/>
      <div class="compose-actions"><AttachmentUploader v-if="!sending" ref="uploader" :draft="draft" v-model="files" compact/><el-button type="primary" native-type="submit" :loading="sending" :disabled="!ready">发送回复</el-button></div>
    </form>
    <p v-else class="empty-thread">已转为正式项目，后续可在项目里继续沟通。</p>
  </section>
</template>

<script setup>
import LinkText from '@/components/LinkText.vue'
import { friendlyTime, fmtTime } from '@/utils/time'
import { money } from '@/utils/payment'
import {ref,computed,nextTick,watch,onBeforeUnmount,onMounted,toRefs} from 'vue'
import { toast as ElMessage } from '@/utils/toast'
import {currentMember} from '@/mock/store'
import {quoteRequest} from '@/stores/quotes'
import {chatDraft,sendDraft} from '@/utils/chatDraft'
import ChatInput from '@/components/ChatInput.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import AttachmentView from '@/customer/components/AttachmentView.vue'
const props=defineProps({quote:{type:Object,required:true}, revision:Number, active:Boolean})
const emit=defineEmits(['seen'])
const items=ref([]),more=ref(false),paging=ref(false),error=ref(''),initialLoading=ref(true)
const draft=chatDraft('quote',props.quote.id,props.quote.employeeId)
const {text:message,files,sending}=toRefs(draft)
const uploader=ref(null),logEl=ref(null)
const ready=computed(()=>!sending.value && !draft.attachmentWaitList?.length && (message.value.trim() || files.value.length))
const newBelow = ref(false)
function atLatest() {
  const log = logEl.value
  return log && log.clientHeight > 0 && log.scrollHeight - log.scrollTop - log.clientHeight <= 4
}
function jumpToLatest() {
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  if (atLatest()) {
    newBelow.value = false
    seen()
  }
}
function onScroll() {
  if (newBelow.value && atLatest()) {
    newBelow.value = false
    seen()
  }
}
const path='/'+props.quote.id+'/conversation'
let generation=0,alive=true
function seen() {
  if(!props.active || document.hidden || !items.value.length) return
  const last=items.value.filter(m=>m.recipientId===currentMember.value.id).at(-1)
  if(last)emit('seen',last.id)
}
async function load(forceScroll=false){
  if(!props.active || document.hidden)return
  const seq=++generation
  try{
    const data=await quoteRequest(path)
    if(!alive || seq!==generation || !props.active || document.hidden)return
    // Decide using the scroll position when the response arrives.
    const follow = forceScroll === true || !items.value.length || atLatest()
    const previousLastId = items.value.at(-1)?.id || 0
    const page=data.items
    const overlap=page.length && items.value.some(m=>m.id===page[0].id)
    if(overlap){
      const earlier=items.value.filter(m=>m.id<page[0].id)
      items.value=[...earlier,...page]
      if(!earlier.length)more.value=data.hasMore
    }else{items.value=page;more.value=data.hasMore}
    error.value=''
    await nextTick()
    if (!alive || seq !== generation || !props.active || document.hidden) return
    if (follow || atLatest()) jumpToLatest()
    else if (page.some(m => m.id > previousLastId && m.recipientId === currentMember.value.id)) newBelow.value = true
  }catch(e){if(alive && seq===generation)error.value=e.message || '沟通记录加载失败'}
  finally{if(alive && seq===generation)initialLoading.value=false}
}
async function earlier(){
  if(paging.value || !items.value.length)return
  const before=items.value[0].id
  paging.value=true
  try{
    const data=await quoteRequest(path+'?before='+before)
    if(!alive || items.value[0]?.id!==before)return
    const old=logEl.value.scrollHeight
    items.value=[...data.items,...items.value];more.value=data.hasMore
    await nextTick();if(logEl.value)logEl.value.scrollTop+=logEl.value.scrollHeight-old
  }catch(e){ElMessage.error(e.message)}finally{paging.value=false}
}
async function send(){
  if(!ready.value)return
  try{
    await sendDraft(draft, ({content,attachments}) => {
      const payload={employeeId:props.quote.employeeId,content,attachments}
      const fingerprint=JSON.stringify(payload)
      if(draft.retry?.fingerprint!==fingerprint) {
        const key=crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')
        draft.retry={fingerprint,key}
      }
      return quoteRequest(path,'POST',{...payload,clientKey:draft.retry.key})
    })
    if(alive)await load(true)
  }catch(e){if(alive)ElMessage.error(e.message || '回复未发送，请重试')}
}
watch(()=>[props.active,props.revision],()=>{if(props.active)load()}, {immediate:true})
const resume=()=>{if(!document.hidden)load()}
onMounted(()=>document.addEventListener('visibilitychange',resume))
onBeforeUnmount(()=>{alive=false;document.removeEventListener('visibilitychange',resume)})
</script>
<style scoped>
.conversation{display:grid;gap:12px;min-width:0}.thread-heading,.compose-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.thread-heading h3{font-size:16px;margin:0}.thread-heading span,.byline,.empty-thread{font-size:12px;color:#6d7a8d}.thread-log{min-height:100px;max-height:min(44vh,420px);overflow:auto;overscroll-behavior:contain;border:1px solid #e5edf8;background:#f6f8fc;border-radius:12px;padding:12px}.empty-thread{text-align:center;padding:10px}.thread-log article{display:flex;align-items:flex-start;flex-direction:column;margin:0 0 14px}.thread-log article:last-child{margin-bottom:0}.thread-log .mine{align-items:flex-end}.byline{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px}.bubble{border:1px solid #e4eaf2;border-radius:10px;background:white;max-width:92%;padding:8px 12px;overflow-wrap:anywhere}.bubble p{white-space:pre-wrap;margin:0;line-height:1.6}.mine .bubble{background:#edf4ff;border-color:#d6e6ff}.price{display:block;color:#165dff}.composer{display:grid;gap:8px}.compose-actions{align-items:flex-end}.compose-actions .att-uploader{min-width:0}.older{display:block;margin:0 auto 12px}
.conversation{display:flex;flex:1;min-height:0;flex-direction:column;gap:6px}.thread-log{flex:1;min-height:0;max-height:none}.composer,.thread-heading{flex:none}.compose-actions{align-items:center}.compose-actions .att-uploader{max-height:min(14vh,100px);overflow:auto;flex:1}.composer :deep(.add-zone){margin:0}.thread-heading h3{font-size:14px}
.jump-to-reply {
  flex: none;
  align-self: center;
  padding: 4px 12px;
  border: 1px solid #ccdcff;
  border-radius: 16px;
  background: #f1f6ff;
  color: #165dff;
  cursor: pointer;
}
</style>
