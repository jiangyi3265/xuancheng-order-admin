<template>
  <main class="request-page">
    <header class="page-heading"><h1>提交需求</h1></header>
    <section v-if="done" class="request-panel receipt">
      <el-icon class="check"><CircleCheckFilled /></el-icon>
      <h2 ref="receiptHeading" tabindex="-1">提交成功</h2>
      <p class="receipt-title">{{ done.subject }}</p>
      <p>{{ done.title }}<span v-if="done.bugId"> · 需求 #{{ done.bugId }}</span></p>
      <p class="receipt-meta">提交时间 {{ done.createTime }}</p>
      <div class="receipt-actions"><el-button type="primary" @click="openReceipt(done)">查看处理进度</el-button>
        <el-button @click="continueIntake">继续提需求</el-button></div>
    </section>
    <section v-else-if="loading || !orders.length" class="request-panel empty" aria-live="polite">
      <p>{{ loading ? '正在加载你的项目…' : loadError ? '项目加载失败，请重试' : '你的账号还没有绑定项目，请联系团队绑定后再提交。' }}</p>
      <el-button v-if="!loading" :loading="refreshing" @click="load">重新加载</el-button>
    </section>
    <div v-else class="request-layout" :class="{'has-recent':recent.length}">
    <p v-if="loadError" class="sync-error" role="status">项目暂时无法刷新，可以继续填写。<el-button link type="primary" :loading="refreshing" @click="load">重试</el-button></p>
    <form class="request-panel" data-paste-zone="提交需求" @submit.prevent="submit">
      <div class="project-context"><span class="folder"><el-icon><FolderOpened /></el-icon></span><div class="project-selector"><span>所属项目</span>
        <strong v-if="orders.length===1 && projectId">{{ orders[0].title }} <small>{{ orders[0].orderNo }}</small></strong>
        <select v-else aria-label="所属项目" :value="projectId" :disabled="form.sending || !!form.annotating || !!form.uploading" @change="chooseProject($event.target.value)">
          <option value="">请选择项目</option><option v-for="o in orders" :key="o.id" :value="String(o.id)">{{ o.title }} · {{ o.orderNo }}</option>
        </select></div>
      </div>
      <p v-if="!projectId" class="hint" role="status">请选择这条需求所属的项目。</p>
      <fieldset v-else :disabled="form.sending">
        <div class="description-heading"><label for="request-description">要改什么？</label>
          <button type="button" class="template-toggle" :aria-expanded="templatesOpen" @click="templatesOpen=!templatesOpen">用模板填写</button></div>
        <div v-if="templatesOpen" class="templates"><button v-for="(prompt,name) in prompts" :key="name" type="button" @click="applyPrompt(prompt)">{{ name }}</button></div>
        <textarea id="request-description" ref="descriptionField" v-model="form.text" rows="5" placeholder="例如：把订单详情里的「签到到店」改成「确认到店」" />
        <div class="materials"><span class="field-label">图片或文件 <small>{{ form.files.length ? '已添加 '+form.files.length+' 个' : '选填' }}</small></span>
          <AttachmentUploader :key="projectId" :draft="form" choose-label="添加图片或文件">
            <template #hint><span class="desktop-hint">可拖入文件，也可粘贴截图</span><span class="mobile-hint">支持图片、视频和文档</span></template>
          </AttachmentUploader></div>
        <details :key="projectId" :open="extrasOpen" @toggle="extrasOpen=$event.target.open" class="extras">
          <summary>补充信息 <small>标题、电话、预算</small></summary>
          <div class="extra-grid"><label>需求标题 <small>选填</small><input v-model="form.title" maxlength="255" placeholder="留空时显示需求首行" /></label>
            <label>联系电话 / 微信 <small>选填</small><input v-model="form.contact" maxlength="100" placeholder="方便团队联系你" /></label>
            <label>参考预算（元） <small>选填</small><input v-model="budget" type="number" min="0" step="0.01" placeholder="预算待定" /></label></div>
        </details>
        <p v-if="failure" class="problem" role="alert">{{ failure }}</p>
        <div v-if="previous" class="problem" role="status">上一次提交已收到，当前草稿已保留。
          <button v-if="previous.id" type="button" @click="openReceipt(previous)">查看上次提交</button>
          <button type="button" @click="startSeparate">作为新需求提交</button></div>
        <el-button v-else type="primary" class="submit" native-type="submit" :loading="form.sending"
          :disabled="!!form.annotating || !!form.uploading || !!form.attachmentWaitList.length">
          {{ form.uploading ? '正在上传附件' : form.attachmentWaitList.length ? '请重试或移除未上传的附件' : '提交需求' }}
        </el-button>
      </fieldset>
    </form>
    <aside v-if="recent.length" class="recent-panel" aria-label="此项目最近提交的需求">
      <h2><el-icon><Clock /></el-icon>最近提交</h2>
      <router-link v-for="r in recent" :key="r.id" :to="{path:'/projects/'+projectId,query:{tab:'bugs',issue:r.id}}">
        <IssueNumber :id="r.id" /> <strong>{{ r.title || '附件需求' }}</strong><span v-if="r.submittedAt" class="recent-meta"><time>{{ r.submittedAt }} 提交</time></span>
        <span class="recent-status"><RequirementStatus :status="r.status" /></span>
      </router-link>
      <router-link class="all-link" :to="{path:'/projects/'+projectId,query:{tab:'bugs'}}">查看项目全部需求 <el-icon><ArrowRight /></el-icon></router-link>
    </aside>
    </div>
  </main>
</template>

<script setup>
import IssueNumber from '@/components/IssueNumber.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, CircleCheckFilled, Clock, FolderOpened } from '@element-plus/icons-vue'
import RequirementStatus from '@/customer/components/RequirementStatus.vue'
import { newestIssueFirst } from '@/utils/issueFilters'
import AttachmentUploader from '@/customer/components/AttachmentUploader.vue'
import { useCustomerOrders } from '@/customer/utils/useCustomerOrders'
import { customerHttp, customerToken } from '@/customer/mock/store'
import { customerIntakeDraft, clearCustomerIntakeDraft } from '@/utils/chatDraft'

const route = useRoute()
const router = useRouter()
const { orders, loading, refreshing, error:loadError, load } = useCustomerOrders()
const projectId = computed(() => {
  const selected = String(route.query.project || '')
  return orders.value.find(o => String(o.id) === selected) ? selected :
    !selected && orders.value.length === 1 ? String(orders.value[0].id) : ''
})
const form = computed(() => customerIntakeDraft(projectId.value || 'new'))
const selectedProject = computed(() => orders.value.find(o => String(o.id) === projectId.value))
const recent = computed(() => [...(selectedProject.value?.requirements || [])].sort(newestIssueFirst).slice(0,3))
const budget = computed({
  get: () => form.value.amount || '',
  set: value => { form.value.amount = Number(value) || 0 }
})
const extrasOpen = ref(false)
const owner = customerToken.value
const done = ref(null)
const previous = ref(null)
const failure = ref('')
const descriptionField = ref(null)
const templatesOpen = ref(false)
const prompts = {
  图片替换: '图片位置：\n需要换成：',
  文字修改: '文字位置：\n原文字：\n改成：',
  新增功能: '需要新增：\n使用场景：',
  页面问题: '出现问题的页面：\n当前表现：\n预期效果：'
}
function applyPrompt(prompt) {
  const draft = form.value
  const before = draft.text.trim()
  if (!before || Object.values(prompts).includes(before)) draft.text = prompt
  else if (!before.includes(prompt)) draft.text = before + '\n\n' + prompt
  templatesOpen.value = false
  descriptionField.value?.focus()
}
const receiptHeading = ref(null)

watch(projectId, id => {
  previous.value = null
  failure.value = ''
  templatesOpen.value = false
  if (!id) return
  // Carry a pre-upgrade draft once, after its destination is known.
  const legacy = customerIntakeDraft()
  const target = form.value
  if (!(target.text || target.title || target.files.length || target.submissionKey || target.attachmentWaitList.length) &&
      (legacy.text || legacy.title || legacy.files.length || legacy.submissionKey || legacy.attachmentWaitList.length)) {
    Object.assign(target, {...legacy, files:[...legacy.files], attachmentWaitList:[...legacy.attachmentWaitList]})
    clearCustomerIntakeDraft(legacy)
  }
  extrasOpen.value = !!(target.title || target.contact || target.amount)
}, {immediate:true})
function continueIntake() {
  done.value = null
  extrasOpen.value = false
  nextTick(() => descriptionField.value?.focus())
}
function chooseProject(id) {
  router.replace({path:'/intake', query:id ? {project:id} : {}})
}
function openReceipt(receipt) {
  router.push({path:'/projects/' + receipt.id, query:receipt.bugId ? {tab:'bugs',issue:receipt.bugId} : {}})
}
function startSeparate() {
  previous.value = null
  form.value.submissionKey = null
  submit()
}
async function submit() {
  const draft = form.value
  const id = projectId.value
  if (!id || draft.sending || draft.annotating || draft.uploading || draft.attachmentWaitList.length || previous.value) return
  failure.value = ''
  if (!owner || owner !== localStorage.getItem('customerToken')) { failure.value = '登录账号已变更，请刷新页面'; return }
  if (!(draft.text.trim() || draft.title.trim() || draft.files.length)) {
    failure.value = '请写下需要修改的内容，或添加图片、文件。'
    descriptionField.value?.focus()
    return
  }
  draft.sending = true
  try {
    draft.submissionKey ||= crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join('')
    const result = await customerHttp('/jiedan/order/intake', {method:'POST',body:JSON.stringify({
      orderId:Number(id), submissionKey:draft.submissionKey, title:draft.title.trim(), requirement:draft.text.trim(),
      contact:(draft.contact || '').trim(), attachments:[...draft.files], amount:draft.amount || 0
    })})
    if (owner !== localStorage.getItem('customerToken')) return
    if (result.replayed && (result.changed || !result.id)) {
      if (id === projectId.value) previous.value = result
      return
    }
    const subject = draft.title.trim() || draft.text.trim().split('\n')[0] || draft.files[0]?.name || '附件需求'
    clearCustomerIntakeDraft(draft)
    if (id !== projectId.value) return
    templatesOpen.value = false
    done.value = {...result, subject}
    load()
    await nextTick()
    receiptHeading.value?.focus()
  } catch (e) {
    if (id !== projectId.value) return
    failure.value = /failed to fetch|network|load failed|网络连不上|超时/i.test(e.message)
      ? '暂未收到提交回执。草稿已保留，请再次提交核对。' : e.message || '未能提交，请重试。'
  } finally { draft.sending = false }
}
</script>

<style scoped>
.request-page {max-width:1160px;margin:auto;padding:clamp(22px,3.5vw,52px) clamp(16px,3.6vw,52px) 96px;color:#172940}
.page-heading {margin:0 0 23px}.page-heading h1 {margin:0;font-size:clamp(25px,2.3vw,34px);line-height:1.25;letter-spacing:-.035em}
.page-heading p,.hint,.receipt p {color:#5e728a;margin:8px 0 0;font-size:14px}
.request-layout {display:grid;align-items:start;gap:18px;max-width:850px}
.request-layout.has-recent {max-width:none}.sync-error {grid-column:1/-1;margin:0;color:#855521;font-size:14px}
.request-panel,.recent-panel {background:white;border:1px solid #d8e3ef;box-shadow:0 5px 20px #263b5b09;border-radius:16px;min-width:0;overflow:hidden}
.project-context {display:flex;align-items:center;gap:12px;background:linear-gradient(100deg,#e9f2ff,#f7faff);border-bottom:1px solid #dce7f3;padding:16px 22px}
.folder {flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:white;color:#245fcc;font-size:22px}
.project-selector {display:grid;gap:3px;min-width:0;flex:1}.project-selector>span {color:#566d88;font-size:12px}.project-selector strong {overflow-wrap:anywhere;font-size:16px}
.project-selector strong small {font-size:12px;display:inline-block;color:#5f748d;font-weight:400;margin-left:6px}
.project-selector select,.extra-grid input,textarea {box-sizing:border-box;max-width:100%;background:white;border:1px solid #cbd7e5;border-radius:9px;color:inherit;padding:10px 12px;font:inherit}
.project-selector select {width:100%}.request-panel .hint {padding:12px 22px 20px}.request-panel fieldset {border:0;margin:0;padding:20px 22px;min-width:0}
.description-heading,.templates,.field-label,.receipt-actions {display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.description-heading {justify-content:space-between;gap:6px;margin-bottom:8px;font-weight:650}
.template-toggle,.templates button,.previous button {cursor:pointer;border:0;background:#edf3ff;color:#2257aa;font:inherit;font-size:13px;border-radius:7px;padding:6px 10px}
.templates {margin:2px 0 10px}.templates button {background:#f2f5f9;color:#425675}
textarea {display:block;width:100%;resize:vertical;font-size:16px;line-height:1.6;padding:13px;background:#fcfdff}
textarea:focus,.extra-grid input:focus {outline:2px solid #98baff;outline-offset:1px}
.materials {margin:18px 0}.field-label {font-size:15px;font-weight:650;margin-bottom:8px}.field-label small,.extra-grid small {font-size:12px;font-weight:400;color:#64778c}
.materials :deep(.add-zone) {width:100%;height:52px;flex-direction:row;gap:8px;border:1px dashed #a9c4ee;background:#f5f9ff;color:#2157b4;border-radius:9px}
.materials :deep(.add-zone.over),.materials :deep(.add-zone:hover) {background:#eaf2ff;border-color:#5485d8}
.materials :deep(.att-uploader .hint) {display:block;padding:0;margin:6px 0 0;color:#61758a;font-size:12px}.mobile-hint {display:none}
.extras {padding:12px 0;border-block:1px solid #e3eaf3}.extras summary {width:fit-content;cursor:pointer;color:#405674;font-size:14px;font-weight:600}.extras summary small {color:#64768b;font-size:12px;font-weight:400;margin-left:5px}
.extra-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));gap:12px;margin:15px 0 2px}
.extra-grid label {font-size:14px;color:#455872}.extra-grid input {width:100%;margin-top:5px}
.submit {margin-top:17px;min-width:126px;height:42px}.problem {color:#a33329;font-size:14px;overflow-wrap:anywhere}
.empty,.receipt,.recent-panel {padding:22px}.receipt {max-width:660px;text-align:center;margin:0 auto}.check {font-size:44px;color:#14805b}
.receipt h2 {margin:8px 0;font-size:22px}.receipt .receipt-title {font-weight:600;color:#213855;font-size:16px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.receipt .receipt-meta {font-size:12px}.receipt-actions {margin-top:20px;justify-content:center}.receipt-actions :deep(.el-button) {margin:0}
.recent-panel h2 {display:flex;align-items:center;gap:8px;font-size:16px;margin:0 0 6px}.recent-panel h2 .el-icon {color:#3971cc}
.recent-panel a {display:block;padding:13px 0;border-bottom:1px solid #e7edf4;text-decoration:none;color:#2c435e}
.recent-panel a:hover {color:#195cce}.recent-panel strong {font-size:14px;overflow-wrap:anywhere}
.recent-meta {display:flex;align-items:center;gap:9px;margin-top:6px}.recent-meta small {color:#64758b}
.recent-panel .all-link {display:flex;align-items:center;gap:5px;padding:12px 0 0;border:0;font-size:13px;color:#245db4}
@media(min-width:1100px){.request-layout.has-recent {grid-template-columns:minmax(0,1fr) minmax(230px,30%)}}
@media(max-width:768px){
  .request-page {padding:20px 12px 96px}.page-heading {margin:0 3px 16px}
  .project-context {padding:14px 15px}.request-panel fieldset,.recent-panel {padding:16px}
  .desktop-hint {display:none}.mobile-hint {display:inline}.submit {width:100%}.request-panel textarea {min-height:120px}
}
.request-page {--sheet-pad:clamp(18px,2.4vw,32px)}
.request-panel,.recent-panel {border-radius:18px;box-shadow:0 6px 24px #16365c0a}
.project-context {padding:18px var(--sheet-pad);background:#102b68;color:white;border-bottom:0}
.project-context .folder {background:#e6f0ff;color:#2851a3;border-radius:12px}.project-selector>span,.project-selector strong small {color:#d2e1fb}
.project-selector strong {font-size:18px}.project-selector select {color:#203653}
.request-panel fieldset {padding:23px var(--sheet-pad)}.description-heading {margin-bottom:10px}.description-heading label {font-size:18px;letter-spacing:-.02em}
.request-panel textarea {background:#fff;border-color:#bdcee2;border-radius:11px;line-height:1.7}
.field-label small {color:#5e7187;font-size:12px;font-weight:400}
.materials :deep(.add-zone) {height:60px;background:#f2f6fd;border:1px dashed #98b5df;border-radius:11px;gap:10px}
.materials :deep(.add-zone .el-icon) {display:grid;place-items:center;box-sizing:content-box;padding:5px;border-radius:7px;background:white;color:#2a5aba;box-shadow:0 1px 4px #29447820}
.materials :deep(.add-zone .az-text) {font-size:14px;font-weight:600}
.extras {border:0;background:#f4f7fb;border-radius:9px;padding:0 12px}.extras summary {width:auto;padding:12px 0}.extras[open] .extra-grid {padding-bottom:13px;margin-top:0}
.submit {min-width:144px;border-radius:9px}.recent-panel {padding:21px}.recent-panel h2 {margin:0 0 10px;font-size:17px}
.recent-panel h2 .el-icon {padding:6px;background:#edf3ff;border-radius:8px;box-sizing:content-box}
.recent-panel a:not(.all-link) {position:relative;padding:14px 0 13px 18px;border-bottom:0;margin-left:5px;border-left:1px solid #d9e4f4}
.recent-panel a:not(.all-link)::before {content:"";position:absolute;left:-4px;top:21px;width:7px;height:7px;background:#5481d3;box-shadow:0 0 0 3px white;border-radius:50%}
.recent-meta {margin:5px 0;flex-wrap:wrap;gap:2px 7px;color:#61738b;font-size:12px;font-variant-numeric:tabular-nums}.recent-meta small {font-size:inherit}
.recent-panel .all-link {margin-top:8px;padding-top:13px;border-top:1px solid #e2e9f4}
.receipt {padding:clamp(25px,4vw,46px) 20px}.receipt .check {background:#e4f5ed;border:6px solid #f4faf7;border-radius:50%;padding:8px;box-sizing:content-box}.receipt h2 {margin:14px 0}
@media (min-width:1100px){.request-layout.has-recent {grid-template-columns:minmax(0,1fr) minmax(250px,30%);gap:22px}}
@media (max-width:768px){.request-page {--sheet-pad:16px}.project-context {padding-block:14px}.request-panel fieldset {padding-block:17px}.materials :deep(.add-zone) {height:54px}.recent-panel {padding:17px}}

</style>
