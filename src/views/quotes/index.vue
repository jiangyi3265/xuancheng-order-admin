<template>
 <div class="quotes-page" :class="{'workbench-quotes': embedded, 'is-empty': embedded && !loading && !filtered.length && !quoteLoadError}">
  <BoardHeader v-if="!embedded" title="报价中心" subtitle="先确认需求与报价，成交后再转项目" back @back="router.push('/workbench')"/>
  <header v-if="embedded" class="workbench-quote-heading">
    <h2>{{ isBoss ? '报价单' : '我的报价任务' }}</h2>
    <el-button v-if="isBoss" size="small" type="primary" :icon="Plus" @click="openCreate">发起报价</el-button>
  </header>
  <div v-if="!embedded" class="quote-toolbar"><el-input v-model="keyword" placeholder="搜索单号、项目名称或姓名" :prefix-icon="Search" clearable/><el-button v-if="isBoss" type="primary" :icon="Plus" @click="openCreate">发起报价</el-button><el-button :loading="loading" :icon="Refresh" aria-label="刷新报价" @click="refresh"/></div>
  <nav v-if="!embedded" class="quote-tabs"><button v-for="s in statuses" :key="s.key" :class="{active:status===s.key}" @click="status=s.key">{{ s.label }} <span>{{ count(s.key) }}</span></button></nav>
  <el-alert v-if="quoteLoadError" :title="quoteLoadError" type="error" :closable="false" show-icon/>
  <div v-if="matchedUnread.length || unreadOnly" class="quote-read-tools">
    <span>{{ matchedUnread.length }} 条未读报价</span>
    <button type="button" class="unread-filter" :aria-pressed="unreadOnly" @click="unreadOnly=!unreadOnly">只看未读</button>
    <el-button v-if="matchedUnread.length" text type="primary" :disabled="busy || marking" @click="readMatched">{{ keyword || status ? '当前结果标为已读' : '全部标为已读' }}</el-button>
  </div>
  <div v-loading="loading" class="quote-list"><article v-for="q in displayed" :key="q.id" class="quote-card">
    <button type="button" class="quote-open" @click="openCard(q.id)"><div class="quote-card-head"><span class="quote-symbol"><el-icon><PriceTag/></el-icon></span><h2><i v-if="isQuoteUnread(q)" class="unread-dot" aria-label="未读"></i>{{ q.title }}</h2><el-tag :type="tag(q.status)">{{ quoteStatus[q.status] }}</el-tag></div><div class="quote-ident">
      <span v-if="isQuoteUnread(q)" class="quote-reason">{{ q.replyVersion > 0 ? '有新回复' : (isBoss ? '收到报价' : '报价邀请') }}</span>
      <span v-if="q.quoteNo && q.title!==q.quoteNo" class="quote-code">{{ q.quoteNo }}</span>
      <span v-if="q.createTime">发起于 <time>{{ formatTime(q.createTime) }}</time></span>
    </div><p class="quote-description">{{ q.requirement || '请查看附件中的需求' }}</p><div class="quote-meta"><span>报价人：{{ q.employeeName || '已删除成员' }}</span><span>{{ q.attachments?.length || 0 }} 个附件</span></div><div class="quote-card-foot"><strong v-if="q.amount!=null"><small v-if="q.status==='pending'">上次报价 </small>{{ money(q.amount, 2) }}</strong><span v-else>等待填写报价</span><small v-if="q.sentTime && q.sentTime!==q.createTime">最近邀请 {{ formatTime(q.sentTime) }}</small><el-icon><ArrowRight/></el-icon></div></button>
    <div v-if="isBoss || isQuoteUnread(q)" class="quote-card-actions">
      <el-button v-if="isQuoteUnread(q)" size="small" text :disabled="busy" @click="readQuotes([q])">标为已读</el-button>
      <el-button v-if="isBoss" size="small" plain type="primary" :disabled="busy" @click="openEdit(q)">编辑</el-button>
      <el-button v-if="isBoss" size="small" plain type="danger" :disabled="busy" @click="remove(q)">删除</el-button>
    </div>
  </article></div>
  <button v-if="embedded && filtered.length > 3" class="quote-expand" @click="expanded=!expanded">{{ expanded ? '收起' : '展开全部 '+filtered.length+' 张报价单' }}</button>
  <el-empty v-if="!loading&&!filtered.length&&!quoteLoadError" :image-size="embedded ? 38 : 90" :description="unreadOnly?'当前没有未读报价':keyword?'没有匹配的报价单':status?'该状态下暂无报价单':isBoss?'还没有报价单，上传需求后发给报价人':'暂无分配给你的报价单'"/>

  <el-dialog v-model="createVisible" :before-close="closeEditor" :title="editing ? '编辑报价单' : '发起报价'" append-to-body class="quote-dialog quote-editor-dialog" :close-on-press-escape="!busy" :show-close="!busy" align-center :style="viewportStyle" :close-on-click-modal="false">
   <el-form class="quote-edit-form" label-position="top" data-paste-zone="报价需求" @submit.prevent>
    <el-form-item class="wide-field" label="谁的项目" :required="!editing">
      <div v-if="editing?.sourceName" class="quote-code">{{ editing.quoteNo }}</div>
      <div v-else class="quote-source-picker">
        <div class="source-options">
          <button v-for="option in sourceOptions" :key="option.name" type="button" :aria-pressed="draft.sourceName===option.name"
            @click="chooseSource(option.name)">{{ option.name }}</button>
          <button type="button" :aria-pressed="draft.sourceName==='其他'" @click="chooseSource('其他')">其他</button>
        </div>
        <el-button v-if="numberError" text type="primary" @click="loadNumbering">重新加载来源</el-button>
        <div v-if="chosenSource" class="number-preview"><span>预计单号 <b>{{ plannedNumber }}</b></span>
          <el-button link type="primary" @click="toggleManual">{{ manual ? '改为自动编号' : '录入已有单号' }}</el-button>
        </div>
        <el-input v-if="manual && chosenSource" v-model="draft.manualNumber" maxlength="32" :placeholder="'例如：'+chosenSource.name+'3'"/>
        <span v-if="draft.sourceName==='其他'" class="quote-help">{{ editing?.quoteNo || '发送时自动分配通用编号' }}</span>
      </div>
    </el-form-item>
    <el-form-item :label="editing ? '项目名称' : '项目名称（选填）'" :required="!!editing"><el-input v-model="draft.title" maxlength="200" :placeholder="editing ? '例如：企业官网开发报价' : '留空则使用报价单号'"/></el-form-item>
    <el-form-item class="wide-field" label="需求说明"><el-input v-model="draft.requirement" type="textarea" :rows="4" maxlength="10000" placeholder="说明要做什么、交付要求、预计时间，也可以直接上传需求文件"/></el-form-item>
    <el-form-item class="wide-field" label="图片 / 文件"><AttachmentUploader v-if="createVisible" :key="editorEpoch" ref="editorUpload" reliable compact v-model="draft.attachments"/></el-form-item>
    <el-form-item label="报价人" required><el-select :disabled="editing?.status==='converted'" v-model="draft.employeeId" placeholder="请选择负责报价的人" filterable><el-option v-for="m in employees" :key="m.id" :label="m.name" :value="m.id"/></el-select><p v-if="editing && draft.employeeId!==editing.employeeId" class="quote-help">更换报价人后，原金额会清空，新邀请发给所选的人。</p><p v-if="!employees.length" class="quote-help">暂无可选报价人，请先在成员管理中新增或启用账号。</p></el-form-item>
   </el-form><el-alert v-if="!editing" title="报价不会计入项目或收款统计，成交后可一键转为项目。" :closable="false" type="info"/>
   <template #footer>
    <el-button :disabled="busy" @click="closeEditor">取消</el-button>
    <el-button v-if="editing" :disabled="editorBlocked || draft.employeeId!==editing.employeeId" :loading="busy" @click="saveDraft(false)">保存</el-button>
    <el-button v-if="!editing || editing.status!=='converted'" type="primary" :loading="busy" :disabled="editorBlocked" @click="saveDraft(true)">
      {{ editing ? '保存并邀请报价' : '发送报价邀请' }}
    </el-button>
   </template>
  </el-dialog>

  <el-dialog :model-value="!!selected || !!openingId" title="报价详情" class="quote-dialog quote-detail-dialog" align-center :style="viewportStyle" :close-on-click-modal="false" @update:model-value="value=>{ if(!value)closeDetail() }">
   <div v-if="openingId && !selected" class="quote-opening" role="status">
     <p>{{ detailError || '正在打开报价单…' }}</p>
     <el-button v-if="detailError" @click="show(openingId)">重新加载</el-button>
   </div>
   <template v-if="selected"><header class="quote-detail-title"><h2>{{ selected.title }}</h2><el-tag :type="tag(selected.status)">{{ quoteStatus[selected.status] }}</el-tag></header><div v-if="detailTab==='info'" class="quote-info"><p v-if="selected.quoteNo">报价单号 <b>{{ selected.quoteNo }}</b></p><p>报价人 <b>{{ selected.employeeName || '已删除成员' }}</b></p><p>发起人 <b>{{ selected.creatorName || '已删除成员' }}</b></p><p>发起时间（北京时间） <b>{{ formatTime(selected.createTime) }}</b></p>
    <p v-if="selected.sentTime && selected.sentTime!==selected.createTime">最近邀请 <b>{{ formatTime(selected.sentTime) }}</b></p></div>
   <div v-if="participant" class="quote-detail-nav"><button :class="{active:detailTab==='info'}" @click="switchTab('info')">报价信息</button><button :class="{active:detailTab==='chat'}" @click="switchTab('chat')">报价沟通 <i v-if="liveQuote?.replyVersion" class="unread-dot"/></button></div>
   <QuoteConversation v-if="participant && chatOpened" v-show="detailTab==='chat'" :key="selected.id+':'+selected.employeeId" :quote="selected" :revision="Number(liveQuote?.conversationVersion || 0)" :active="detailTab==='chat'" @seen="readConversation"/>
   <div v-if="detailTab==='info'" class="quote-info-scroll">
   <section class="quote-section"><h3>需求说明</h3><p class="quote-requirement">{{ selected.requirement || '详见附件' }}</p><h3>需求附件（{{ selected.attachments?.length || 0 }}）</h3><AttachmentView v-if="selected.attachments?.length" :items="selected.attachments" :size="100"/><p v-else class="quote-help">暂无附件</p></section>
   <section v-if="selected.amount!=null" class="quote-result"><span>{{ selected.employeeName }} 的{{ selected.status==='pending' ? '上次报价' : '报价' }}</span><strong>{{ money(selected.amount, 2) }}</strong><p>{{ selected.quoteNote || '未填写报价说明' }}</p><el-button v-if="participant" type="primary" link @click="switchTab('chat')">继续沟通</el-button></section>
   <el-form v-if="canPrice" class="quote-price-form" label-position="top" :disabled="busy" @submit.prevent>
     <div v-if="reviewPrice" class="price-review" role="status">报价单已更新，你填写的金额和说明已保留。请先核对最新需求。<el-button size="small" @click="reviewPrice=false">已核对新需求</el-button></div>
     <el-form-item label="报价金额（元）" required><el-input-number v-model="price.amount" :min="0.01" :max="9999999999.99" :precision="2" :controls="false" placeholder="请输入报价金额"/></el-form-item><el-form-item label="报价说明"><el-input v-model="price.quoteNote" type="textarea" :rows="4" maxlength="5000" placeholder="例如：包含哪些内容、预计工期、报价有效期"/></el-form-item><el-alert title="提交前请确认金额和范围，发起人可将此报价转为正式项目。" :closable="false" type="info"/></el-form>
   <p v-if="selected.status==='converted'" class="quote-help">已生成正式项目。删除此报价单不会删除关联项目。</p>
   </div>
   <div v-if="isBoss && detailTab==='info'" class="quote-secondary"><el-button :disabled="busy" @click="openEdit(selected)">编辑报价单</el-button><el-button v-if="selected.status!=='converted'" :disabled="busy" @click="assignId=selected.employeeId;assignVisible=true">重新指派</el-button><el-button type="danger" plain :disabled="busy" @click="remove(selected)">删除报价单</el-button></div>
   </template>
   <template #footer>
     <div class="quote-footer-actions">
       <el-button @click="closeDetail">关闭</el-button>
       <el-button v-if="selected && remainingTasks.length" :disabled="busy" @click="openNextTask"
         :title="'下一张：' + remainingTasks[0].title">下一条待处理（{{ remainingTasks.length }}）</el-button>
       <small v-else-if="selected && continued" role="status">已到本轮最后一张</small>
       <el-button v-if="canPrice && detailTab==='info'" type="primary" :loading="busy" :disabled="reviewPrice" @click="submitPrice">{{ selected?.status==='quoted'?'更新报价':'提交报价' }}</el-button>
       <el-button v-if="isBoss&&selected?.status==='quoted'&&detailTab==='info'" type="primary" :loading="busy" @click="convert">转为正式项目</el-button>
       <el-button v-if="selected?.orderId" type="primary" @click="openProject">查看项目</el-button>
     </div>
   </template>
  </el-dialog>
  <el-dialog v-model="assignVisible" :close-on-click-modal="false" :before-close="closeReassign" title="重新指派报价" append-to-body class="quote-dialog" align-center :style="viewportStyle"><el-alert title="重新指派会清空原报价，需求和附件保持不变。" type="warning" :closable="false"/><el-select v-model="assignId" placeholder="请选择报价人"><el-option v-for="m in employees" :key="m.id" :label="m.name" :value="m.id"/></el-select><template #footer><el-button @click="closeReassign">取消</el-button><el-button type="primary" :loading="busy" @click="assign">确认重新指派</el-button></template></el-dialog>
 </div>
</template>
<script setup>
import { useFormClose } from '@/utils/dialogGuard'
import { money } from '@/utils/payment'
import {ref,reactive,computed,onMounted,onBeforeUnmount,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import {Search,Plus,Refresh} from '@element-plus/icons-vue'
import QuoteConversation from './QuoteConversation.vue'
import BoardHeader from '@/components/board/BoardHeader.vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import AttachmentView from '@/customer/components/AttachmentView.vue'
import {MEMBERS} from '@/constants/options'
import {isBoss,currentMember} from '@/mock/store'
import {quotes,quoteLoadError,syncQuotes,quoteRequest,quoteStatus,isQuoteUnread,markQuotesRead} from '@/stores/quotes'
const {embedded} = defineProps({embedded:{type:Boolean,default:false}})
const editing=ref(null), expanded=ref(false)
const router=useRouter(),route=useRoute(),keyword=ref(''),status=ref(''),loading=ref(false),busy=ref(false),createVisible=ref(false),selected=ref(null),assignVisible=ref(false),assignId=ref(null)
const openingId=ref(null),detailError=ref(''),editorUpload=ref(null),editorEpoch=ref(0)
const editorBlocked=computed(()=>!!(editorUpload.value?.uploadingCount || editorUpload.value?.failedCount))
const unreadOnly=ref(false),marking=ref(false)
const viewportStyle = ref({})
const viewport = window.visualViewport
function syncViewport() {
  if (viewport) viewportStyle.value = { '--quote-height': viewport.height+'px', '--quote-top': viewport.offsetTop+'px' }
}
watch(() => !!selected.value || !!openingId.value || createVisible.value || assignVisible.value, open => {
  if (open) {
    syncViewport()
    viewport?.addEventListener('resize',syncViewport)
    viewport?.addEventListener('scroll',syncViewport)
  } else releaseViewport()
})
function releaseViewport() {
  viewport?.removeEventListener('resize',syncViewport)
  viewport?.removeEventListener('scroll',syncViewport)
}
onBeforeUnmount(releaseViewport)
const blank=()=>({title:'',requirement:'',attachments:[],employeeId:null,sourceName:'',manualNumber:''})
const draft=reactive(blank()),price=reactive({amount:null,quoteNote:''})
let originalDraft
const closeEditor = useFormClose({
  visible: () => createVisible.value, close: () => { createVisible.value = false },
  isDirty: () => editorBlocked.value || JSON.stringify(draft) !== JSON.stringify(originalDraft),
  isBusy: () => busy.value
})
const closeReassign = useFormClose({
  visible: () => assignVisible.value, close: () => { assignVisible.value = false },
  isDirty: () => assignId.value !== selected.value?.employeeId, isBusy: () => busy.value
})
const statuses=[{key:'',label:'全部'},{key:'pending',label:'待报价'},{key:'quoted',label:'已报价'},{key:'converted',label:'已转项目'}]
const employees=computed(()=>MEMBERS.filter(m=>m.role==='staff'||m.role==='employee').filter(m=>m.status==='0'))
const sourceOptions=ref([]), numberError=ref(false), manual=ref(false)
const chosenSource=computed(()=>sourceOptions.value.find(option=>option.name===draft.sourceName))
const plannedNumber=computed(()=>{
  const option=chosenSource.value
  if(!option)return ''
  const entered=draft.manualNumber.trim()
  if(manual.value && entered)return /^\d+$/.test(entered) ? option.name+entered : entered
  return option.name+option.next
})
const defaultEmployeeId=computed(()=>employees.value.find(member=>member.defaultQuoteEmployee)?.id ?? null)
watch(defaultEmployeeId,id=>{ if(createVisible.value && !editing.value && draft.employeeId==null){ draft.employeeId=id; originalDraft.employeeId=id } })
const formatTime=value=>value ? String(value).slice(0,16) : ''
const normalizeSearch=value=>String(value||'').replace(/\s+/g,'').toLowerCase()
const matches=computed(()=>{
  const term=normalizeSearch(keyword.value)
  return quotes.value.filter(q=>(!status.value||q.status===status.value) &&
    (!term || [q.quoteNo,q.sourceName,q.title,q.employeeName,q.creatorName,q.requirement].some(v=>normalizeSearch(v).includes(term))))
})
const matchedUnread=computed(()=>matches.value.filter(isQuoteUnread))
const filtered=computed(()=>unreadOnly.value ? matchedUnread.value : matches.value)
const workGroups = computed(() => {
  const unread = [], awaiting = [], rest = []
  const memberId = currentMember.value.id
  for (const quote of filtered.value) {
    const involved = quote.creatorId === memberId || quote.employeeId === memberId
    if (involved && isQuoteUnread(quote)) unread.push(quote)
    else if (!isBoss.value && quote.employeeId === memberId && quote.status === 'pending') awaiting.push(quote)
    else rest.push(quote)
  }
  return { tasks: [...unread, ...awaiting], rest }
})
const displayed = computed(() => {
  if (!embedded) return filtered.value
  const rows = [...workGroups.value.tasks, ...workGroups.value.rest]
  return expanded.value ? rows : rows.slice(0, 3)
})
const visitedQuotes = reactive(new Set())
const continued = ref(false)
const remainingTasks = computed(() =>
  workGroups.value.tasks.filter(quote => !visitedQuotes.has(quote.id))
)
function openNextTask() {
  const next = remainingTasks.value[0]
  if (!next || !selected.value || openingId.value || busy.value) return
  if (canPrice.value && hasPriceEdits(selected.value)) {
    ElMessage.info('未提交的金额和说明已保留，可在当前页面重新打开这张报价单继续填写。')
  }
  continued.value = true
  if (embedded) show(next.id)
  else router.replace({ query: { id: String(next.id) } })
}
async function readMatched() {
  if(marking.value)return
  marking.value=true
  try{await readQuotes(matchedUnread.value.slice())}finally{marking.value=false}
}
async function readQuotes(rows) {
  try { await markQuotesRead(rows) } catch (e) { ElMessage.error(e.message || '标记已读失败，请重试') }
}
const detailTab=ref('info'),chatOpened=ref(false),reviewPrice=ref(false)
const participant=computed(()=>selected.value && [selected.value.creatorId,selected.value.employeeId].includes(currentMember.value.id))
const liveQuote=computed(()=>quotes.value.find(q=>q.id===selected.value?.id))
function switchTab(tab,updateRoute=true){
  detailTab.value=tab
  if(tab==='chat')chatOpened.value=true
  if(updateRoute && !embedded && selected.value)router.replace({query:{id:selected.value.id,...(tab==='chat'?{tab:'chat'}:{})}})
}
async function readConversation(seen){
  const q=liveQuote.value || selected.value
  if(q && q.replyVersion>0) await readQuotes([{...q,replyVersion:Math.min(seen,q.replyVersion)}])
}
watch([liveQuote,busy],([row,saving],[prev])=>{
  if(!selected.value)return
  if(!row){if(prev?.id===selected.value.id)closeDetail();return}
  if(Number(row.version)>Number(selected.value.version) && !saving) {
    const before=selected.value
    const hasEdits=canPrice.value && hasPriceEdits(before)
    selected.value={...row}
    if(hasEdits && canPrice.value)reviewPrice.value=true
    else resetPrice(selected.value)
  }
})
const canPrice=computed(()=>selected.value&&selected.value.employeeId===currentMember.value.id&&selected.value.status!=='converted'&&!isBoss.value)
const unsentPrices = new Map()
watch(() => currentMember.value.id, () => {
  unsentPrices.clear()
  visitedQuotes.clear()
  continued.value = false
})
function hasPriceEdits(quote) {
  const originalAmount = quote.amount == null ? null : Number(quote.amount)
  return (price.amount ?? null) !== originalAmount || price.quoteNote !== (quote.quoteNote || '')
}
function rememberPrice() {
  const quote = selected.value
  if (!quote || !canPrice.value) return
  if (hasPriceEdits(quote)) {
    unsentPrices.set(quote.id, {
      amount: price.amount, quoteNote: price.quoteNote,
      version: quote.version, needsReview: reviewPrice.value, employeeId: quote.employeeId
    })
  } else unsentPrices.delete(quote.id)
}
function restorePrice(quote) {
  resetPrice(quote)
  const saved = unsentPrices.get(quote.id)
  if (!saved) return
  if (!canPrice.value || saved.employeeId !== quote.employeeId) {
    unsentPrices.delete(quote.id)
    return
  }
  price.amount = saved.amount
  price.quoteNote = saved.quoteNote
  reviewPrice.value = saved.needsReview || Number(saved.version) !== Number(quote.version)
}
function resetPrice(q) {
  price.amount=q.amount==null ? null : Number(q.amount)
  price.quoteNote=q.quoteNote || ''
  reviewPrice.value=false
}

const tag=s=>s==='pending'?'warning':s==='converted'?'success':'primary'
const count=s=>quotes.value.filter(q=>!s||q.status===s).length
async function refresh(){loading.value=true;try{await syncQuotes()}catch(e){ElMessage.error(e.message)}finally{loading.value=false}}
async function loadNumbering(){
  try { const options=await quoteRequest('/numbering');sourceOptions.value=Array.isArray(options)?options:[];numberError.value=false }
  catch { numberError.value=true }
}
function chooseSource(name){ draft.sourceName=name; manual.value=false; draft.manualNumber='' }
function toggleManual(){ manual.value=!manual.value; draft.manualNumber='' }
function openCreate(){
  editorEpoch.value++
  editing.value=null; manual.value=false
  Object.assign(draft,blank(),{employeeId:defaultEmployeeId.value})
  originalDraft = { ...draft, attachments: [] }
  createVisible.value=true
  loadNumbering()
}
let showEpoch=0
onBeforeUnmount(()=>{showEpoch++})
function openCard(id) {
  if(embedded || String(route.query.id)===String(id))show(id)
  else router.push({query:{id:String(id)}})
}
async function show(id) {
  if (!/^\d+$/.test(String(id))) return
  const epoch = ++showEpoch
  openingId.value=id
  detailError.value=''
  if (String(selected.value?.id) !== String(id)) {
    rememberPrice()
    selected.value = null
    assignVisible.value = false
  }
  try {
    const quote = await quoteRequest('/' + id)
    if (epoch !== showEpoch) return
    if (!quote) throw new Error('报价单已删除或当前账号无法查看')
    chatOpened.value=false
    selected.value = quote
    visitedQuotes.add(quote.id)
    openingId.value=null
    const chat=participant.value && ((!embedded && route.query.tab==='chat') || quote.replyVersion>0)
    switchTab(chat?'chat':'info',false)
    restorePrice(quote)
    if (!embedded && (String(route.query.id)!==String(id) || !!route.query.tab!==Boolean(chat))) switchTab(detailTab.value)
    const info={...quote,replyVersion:0}; if (isQuoteUnread(info)) await readQuotes([info])
  } catch (e) {
    if (epoch !== showEpoch) return
    selected.value = null
    detailError.value=e.message || '加载失败，请重试'
  }
}
function resetDetail() {
  rememberPrice()
  visitedQuotes.clear()
  continued.value = false
  showEpoch++
  selected.value = null
  openingId.value = null
  detailError.value = ''
  assignVisible.value = false
}
function closeDetail(){
  resetDetail()
  if(embedded || !route.query.id)return
  if(window.history.state?.back==='/quotes')router.back()
  else router.replace({query:{}})
}
async function act(fn){if(busy.value)return;busy.value=true;try{await fn()}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
function openEdit(q) {
  editorEpoch.value++
  editing.value = {id:q.id, version:q.version, status:q.status, employeeId:q.employeeId,sourceName:q.sourceName,quoteNo:q.quoteNo}
  manual.value=false
  if(!q.sourceName)loadNumbering()
  Object.assign(draft, {sourceName:q.sourceName || '',manualNumber:'',title:q.title, requirement:q.requirement || '', attachments:(q.attachments || []).map(a=>({...a})), employeeId:q.employeeId})
  originalDraft = { ...draft, attachments: [...draft.attachments] }
  createVisible.value = true
}
async function saveDraft(requestPrice) {
  if (editorBlocked.value) return
  if (!editing.value && !draft.sourceName) return ElMessage.warning('请选择项目来源')
  if (editing.value && !draft.title.trim()) return ElMessage.warning('请填写报价标题')
  if (manual.value && !draft.manualNumber.trim()) return ElMessage.warning('请填写已有单号，或改为自动编号')
  if (!draft.employeeId) return ElMessage.warning('请选择报价人')
  if (!draft.requirement.trim() && !draft.attachments.length) return ElMessage.warning('请填写需求说明或上传图片、文件')
  await act(async () => {
    const {sourceName,manualNumber,...payload}=draft
    if(sourceName && sourceName!=='其他')payload.sourceName=sourceName
    if(manualNumber)payload.manualNumber=manualNumber
    if (editing.value) {
      const q = await quoteRequest('/' + editing.value.id, 'PUT', {...payload, version:editing.value.version, requestPrice})
      if (selected.value?.id === q.id) selected.value = q
      ElMessage.success(requestPrice ? '已保存并发送报价邀请' : '报价单已保存')
    } else {
      const q = await quoteRequest('', 'POST', payload)
      ElMessage.success('已发送报价邀请')
      await show(q.id)
    }
    createVisible.value = false
  })
}
async function submitPrice(){
  const q=selected.value
  if(!q || !canPrice.value || reviewPrice.value)return
  if(!(price.amount>0))return ElMessage.warning('请填写大于 0 的报价金额')
  await act(async()=>{
    let updated
    try {
      updated=await quoteRequest('/'+q.id+'/price','PUT',{...price,version:q.version})
    } catch(error) {
      if(selected.value?.id===q.id)await syncQuotes().catch(()=>{})
      throw error
    }
    unsentPrices.delete(q.id)
    if(selected.value?.id===q.id && Number(updated.version)>=Number(selected.value.version)){
      selected.value=updated
      resetPrice(updated)
    }
    ElMessage.success('报价已提交')
  })
}
async function assign(){
  const q=selected.value
  if(!q)return
  if(!assignId.value)return ElMessage.warning('请选择报价人')
  await act(async()=>{
    const updated=await quoteRequest('/'+q.id+'/assign','PUT',{employeeId:assignId.value,version:q.version})
    if(selected.value?.id===q.id){selected.value=updated;assignVisible.value=false}
    ElMessage.success('已重新指派')
  })
}
async function remove(quote) {
  const message = quote.orderId ? '关联的正式项目会保留。' : '删除后将无法继续报价。'
  try {
    await ElMessageBox.confirm('确定删除「' + quote.title + '」吗？' + message, '删除报价单', {
      type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消'
    })
  } catch { return }
  await act(async () => {
    await quoteRequest('/' + quote.id, 'DELETE', { version: quote.version })
    if (selected.value?.id === quote.id) closeDetail()
    ElMessage.success('报价单已删除')
  })
}
async function convert(){
  const q=selected.value
  if(!q)return
  try{await ElMessageBox.confirm('将带入需求、附件、负责人和报价，生成一个待确认项目。','转为正式项目',{confirmButtonText:'确认转项目',cancelButtonText:'取消'})}catch{return}
  if(selected.value?.id!==q.id)return
  await act(async()=>{
    const updated=await quoteRequest('/'+q.id+'/convert','POST',{version:q.version})
    if(selected.value?.id===q.id)selected.value=updated
    ElMessage.success('已转为正式项目')
  })
}
function openProject(){const id=selected.value?.orderId;if(id)router.push({path:'/order',query:{id:String(id)}})}
watch(()=>route.query.tab,tab=>{if(!embedded && participant.value && String(selected.value.id)===String(route.query.id))switchTab(tab==='chat'?'chat':'info',false)})
watch(()=>route.query.id,id=>{
  if(embedded)return
  if(!id || !/^\d+$/.test(String(id)))resetDetail()
  else if(String(selected.value?.id)!==String(id))show(id)
})
onMounted(()=>{if(!embedded){refresh();if(route.query.id)show(route.query.id)}})
</script>
<style scoped>
.quote-footer-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:6px}
.quote-footer-actions>.el-button{margin:0}
.quote-footer-actions>small{color:#64748b;font-size:12px}
@media(max-width:480px){.quote-footer-actions>.el-button{padding-inline:9px}}
.price-review{display:grid;gap:6px;justify-items:start;padding:9px;margin-bottom:8px;border-radius:8px;background:#fff4de;color:#785005;font-size:13px}
.quote-opening{margin:auto;text-align:center;color:#576b87}
.quote-reason{color:#954319;background:#fff2e6;border-radius:5px;padding:2px 7px;font-weight:600}
.quote-read-tools{flex-wrap:wrap}
.quote-read-tools .unread-filter{border:1px solid #ccd9ea;background:#fff;color:#39526e;padding:5px 12px;border-radius:16px;font:inherit;cursor:pointer;margin-right:auto}
.quote-read-tools .unread-filter[aria-pressed=true]{background:#eaf2ff;color:#154ac4;border-color:#9bbaff}
.quote-ident,.source-options,.number-preview{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.quote-ident{margin-top:8px;color:#62738e;font-size:12px}.quote-code,.number-preview b{color:#165dff;font-weight:650}.quote-ident .quote-code{padding:2px 7px;background:#edf3ff;border-radius:5px}.quote-source-picker{width:100%;display:grid;gap:8px}.source-options button{border:1px solid #cbd6e5;border-radius:8px;background:#fff;color:#394963;cursor:pointer;padding:6px 12px;min-height:34px;font:inherit;line-height:1.3}.source-options [aria-pressed=true]{background:#edf3ff;border-color:#165dff;color:#164bc6;font-weight:650}.number-preview{justify-content:space-between}

.quote-detail-nav{display:flex;gap:4px;background:#f1f5fb;padding:4px;border-radius:10px;margin:12px 0}.quote-detail-nav button{flex:1;border:0;border-radius:8px;padding:8px;background:transparent;color:#63728a;font:inherit;cursor:pointer}.quote-detail-nav .active{background:white;color:#165dff;font-weight:650;box-shadow:0 1px 4px #dde4f0}

.quotes-page{max-width:1050px;margin:auto}.quotes-page>.board-header{padding:5px 0 22px}.quote-toolbar{display:flex;gap:10px;margin-bottom:20px}.quote-toolbar>.el-input{flex:1}.quote-tabs{display:flex;gap:8px;margin-bottom:20px;border-bottom:1px solid #dde6f4}.quote-tabs button{flex:1;border:0;background:none;padding:13px 5px;color:#7e8ca4;cursor:pointer}.quote-tabs button.active{color:#165dff;box-shadow:inset 0 -3px #165dff;font-weight:650}.quote-tabs span{font-size:12px}.quote-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.quote-card{text-align:left;padding:20px;background:white;border:1px solid #e5edf8;border-radius:15px;cursor:pointer;min-width:0}.quote-card-head{display:flex;gap:10px;align-items:center}.quote-card h2{font-size:19px;flex:1;margin:0;overflow-wrap:anywhere}.quote-symbol{background:#edf4ff;color:#165dff;padding:10px;border-radius:12px;font-size:22px;display:flex}.quote-description{font-size:15px;color:#697b97;line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.quote-meta{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:#8b98ab}.quote-card-foot{display:flex;align-items:center;gap:8px;margin-top:17px;padding-top:15px;border-top:1px solid #edf2fa}.quote-card-foot strong{color:#165dff;font-size:23px}.quote-card-foot small{margin-left:auto;color:#92a0b6;font-size:11px}.quote-card-foot>span{color:#a0abbb;font-size:14px}.quote-detail-title{display:flex;align-items:flex-start;gap:14px}.quote-detail-title h2{margin:0;flex:1;font-size:23px;overflow-wrap:anywhere}.quote-info{padding:14px 0;color:#8492a9;font-size:14px}.quote-info p{display:flex;gap:20px;justify-content:space-between}.quote-info b{font-weight:500;color:#3b506e}.quote-section{padding:18px;background:white;border-radius:14px;margin-bottom:18px}.quote-section h3{font-size:18px;margin:8px 0 14px}.quote-requirement{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:16px}.quote-help{font-size:13px;color:#8291a8;line-height:1.7; margin-bottom:0}.quote-result{padding:22px;background:#edf4ff;border-radius:14px;margin-bottom:20px}.quote-result>span{font-size:14px;color:#7a8eaf}.quote-result strong{display:block;color:#165dff;font-size:32px;margin:10px 0}.quote-result p{white-space:pre-wrap;overflow-wrap:anywhere;color:#425b7e;font-size:16px;line-height:1.7}.quote-secondary{display:flex;gap:12px;margin-top:22px}.quote-secondary .el-button{margin:0;flex:1}.quote-price-form .el-input-number{width:100%}.quote-dialog .el-select{width:100%}.quote-dialog>.el-select{margin-top:25px}
@media(max-width:768px){.quote-list{grid-template-columns:1fr;gap:13px}.quote-toolbar{gap:7px}.quote-toolbar>.el-button{padding:0 10px}.quote-card{padding:18px 14px}.quote-tabs button{font-size:15px}.quote-card h2{font-size:19px}.quote-detail-title h2{font-size:22px}.quote-dialog .el-form-item{margin-bottom:20px}.quote-dialog .el-form{padding:18px 14px}.quote-toolbar .el-input{min-width:0}.quote-toolbar input{font-size:14px}.quote-meta{font-size:13px}.quote-card-head .el-tag{font-size:12px}}
.quote-open {display:block;width:100%;padding:0;border:0;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer}
.quote-card-actions {display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.quote-card-actions .el-button {margin:0}
.workbench-quotes{box-sizing:border-box;width:100%;max-width:none;margin:0 0 16px;background:white;padding:16px;border:1px solid #e5edf8;border-radius:15px}
.workbench-quote-heading,.quote-read-tools{display:flex;align-items:center;justify-content:space-between;gap:12px}
.workbench-quote-heading h2{margin:0;font-size:19px}.workbench-quote-heading{margin-bottom:10px}
.quote-read-tools{font-size:13px;color:#687995;margin-bottom:8px}.quote-expand{display:block;margin:10px auto 0;color:#165dff;border:0;background:none;cursor:pointer}
/* 工作台上没有报价单时缩成一行：标题 · 提示 · 发起报价，不再占一大块 */
.workbench-quotes.is-empty{display:flex;align-items:center;gap:12px;padding:10px 16px}
.workbench-quotes.is-empty .workbench-quote-heading{display:contents}
.workbench-quotes.is-empty .workbench-quote-heading h2{font-size:15px;flex:none}
.workbench-quotes.is-empty .workbench-quote-heading .el-button{order:2;margin-left:auto}
.workbench-quotes.is-empty .quote-list{display:none}
.workbench-quotes.is-empty .el-empty{order:1;flex:1 1 auto;align-items:flex-start;padding:0;min-width:0}
.workbench-quotes.is-empty :deep(.el-empty__image){display:none}
.workbench-quotes.is-empty :deep(.el-empty__description){margin:0;width:100%;text-align:left}
.workbench-quotes.is-empty :deep(.el-empty__description p){font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.workbench-quotes .quote-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:10px}
.workbench-quotes .quote-card{padding:12px}.workbench-quotes .quote-card h2{font-size:16px}.workbench-quotes .quote-description{margin:7px 0;-webkit-line-clamp:1}.workbench-quotes .quote-card-foot{margin-top:8px;padding-top:7px}.workbench-quotes .quote-card-foot strong{font-size:18px}.workbench-quotes :deep(.el-empty){padding:8px}
.quote-card .unread-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4351;margin-right:6px;vertical-align:middle}.quote-secondary{flex-wrap:wrap}
.quote-info{display:flex;flex-wrap:wrap;column-gap:18px;row-gap:3px;padding:5px 0;font-size:13px}.quote-info p{gap:6px;margin:0}.quote-detail-title h2{font-size:19px;max-height:2.6em;overflow:auto}.quote-detail-nav{margin:6px 0}.quote-secondary{margin-top:6px;gap:6px}.quote-secondary .el-button{padding:0 8px}.quote-info-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}.quote-section,.quote-result{padding:12px;margin:0}.quote-section h3{font-size:15px;margin:0 0 6px}.quote-section h3:not(:first-child){margin-top:12px}.quote-section p,.quote-result p{margin:4px 0;font-size:14px;line-height:1.55}.quote-result strong{font-size:25px;margin:4px 0}.quote-edit-form{display:grid;grid-template-columns:1fr 1fr;column-gap:16px}.quote-edit-form .wide-field{grid-column:1/-1}.quote-edit-form>.el-form-item:last-child{grid-row:2;grid-column:2}
@media(min-width:769px){.quote-info-scroll{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:12px}.quote-info-scroll .quote-section{grid-row:span 3}.quote-info-scroll .quote-section:only-child{grid-column:1/-1}}
</style>
<style>
.el-dialog.quote-dialog{display:flex;flex-direction:column;width:min(780px,94vw);max-height:calc(100vh - 28px);max-height:calc(100dvh - 28px);min-height:0;padding:16px 18px;overflow:hidden}
.el-dialog.quote-dialog>.el-dialog__header{position:relative;flex:none;padding-bottom:9px}
.el-dialog.quote-dialog>.el-dialog__body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain}
.el-dialog.quote-dialog>.el-dialog__footer{position:static;flex:none;padding:8px 0 0}
.el-dialog.quote-detail-dialog{height:min(670px,calc(100dvh - 28px))}
.el-dialog.quote-detail-dialog>.el-dialog__body{display:flex;flex-direction:column;overflow:hidden}
.quote-detail-dialog .quote-detail-title,.quote-detail-dialog .quote-info,.quote-detail-dialog .quote-detail-nav,.quote-detail-dialog .quote-secondary{flex:none}
.quote-dialog .el-form.quote-edit-form,.quote-dialog .el-form.quote-price-form{padding:8px}
.quote-dialog .el-form-item{margin-bottom:9px}.quote-dialog .el-form-item .el-form-item__label{margin-bottom:3px;line-height:1.4;height:auto;padding-bottom:0}
@media(max-width:768px){
  .el-dialog.quote-dialog{width:100%!important;margin:var(--quote-top,0px) 0 0!important;position:absolute;top:0;left:0;max-height:var(--quote-height,100dvh);height:var(--quote-height,100dvh);min-height:0;padding:10px 12px max(8px,env(safe-area-inset-bottom))}
  .el-dialog.quote-dialog .el-dialog__footer .el-button{font-size:14px;min-height:36px}.el-dialog.quote-dialog .el-dialog__title{font-size:17px}
}
</style>
