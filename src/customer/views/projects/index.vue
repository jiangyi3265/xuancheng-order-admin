<template>
  <main class="project-home">
    <header class="page-heading" :class="{'one-project':single}">
      <div class="head-copy">
        <h1>{{ single ? '我的需求' : '我的项目' }}</h1>
        <p v-if="single"><strong>{{ single.title }}</strong><span v-if="single.status" class="project-state">{{ statusMap[single.status]?.label || single.status }}</span><span>{{ single.orderNo }}</span><span v-if="single.deadline">截止 {{ single.deadline }}</span></p>
        <p v-else-if="orders.length">{{ orders.length }} 个项目 · {{ total }} 条修改需求</p>
      </div>
      <button v-if="single" type="button" class="create" @click="newRequest(single)"><el-icon><Plus /></el-icon>提需求</button>
    </header>
    <!-- 团队提交验收后，首页最上面直接提示，点进去就能确认验收（以前要自己点进「项目详情」才看得到） -->
    <section v-if="toAccept.length" class="review-inbox accept-inbox" aria-label="等我验收">
      <router-link v-for="p in toAccept" :key="p.id" class="review-link" :to="'/projects/'+p.id">
        <span class="review-count">等我验收</span>
        <span class="review-name">{{ p.title }}<small>{{ openCount(p) ? '还有 ' + openCount(p) + ' 条修改需求没解决，可以等处理好再验收' : '团队已交付，请检查后确认验收' }}</small></span>
        <span class="accept-go">去验收</span>
        <el-icon aria-hidden="true"><ArrowRight /></el-icon>
      </router-link>
    </section>
    <section v-if="waiting.length" class="review-inbox" aria-label="等我确认">
      <router-link v-if="waiting.length===1" class="review-link" :to="reviewRoute(waiting[0].project,waiting[0].item)">
        <span class="review-count">等我确认（1）</span>
        <span class="review-name"><IssueNumber :id="waiting[0].item.id" /> {{ waiting[0].item.title || '截图需求' }}<small v-if="!single">{{ waiting[0].project.title }}</small></span>
        <el-icon aria-hidden="true"><ArrowRight /></el-icon>
      </router-link>
      <details v-else>
        <summary>等我确认（{{ waiting.length }}）<el-icon aria-hidden="true"><ArrowDown /></el-icon></summary>
        <div class="review-list">
          <router-link v-for="entry in waiting" :key="entry.item.id" class="review-link" :to="reviewRoute(entry.project,entry.item)">
            <span class="review-name"><IssueNumber :id="entry.item.id" /> {{ entry.item.title || '截图需求' }}<small v-if="!single">{{ entry.project.title }}</small></span>
            <el-icon aria-hidden="true"><ArrowRight /></el-icon>
          </router-link>
        </div>
      </details>
    </section>
    <label v-if="total" class="request-search">
      <el-icon aria-hidden="true"><Search /></el-icon>
      <input v-model="query" type="search" maxlength="160" aria-label="搜索需求名称或编号" placeholder="搜索需求名称或编号" />
    </label>
    <div v-if="loadError" class="feedback" role="status">{{ loadError }}
      <el-button link type="primary" :loading="refreshing" @click="load">重试</el-button>
    </div>
    <p v-if="loading" class="feedback" role="status">正在加载项目…</p>
    <div v-else-if="!orders.length && !loadError" class="feedback">请联系团队绑定项目，绑定后就能查看和提交需求。</div>
    <article v-for="{project, counts, rows} in groups" :key="project.id" class="project">
      <header v-if="!single" class="project-heading">
        <el-icon class="folder" aria-hidden="true"><FolderOpened /></el-icon>
        <div class="identity"><h2>{{ project.title }}</h2><p><span v-if="project.status" class="project-state">{{ statusMap[project.status]?.label || project.status }}</span><span>{{ project.orderNo }}</span><span v-if="project.deadline">截止 {{ project.deadline }}</span></p></div>
        <button type="button" class="create" @click="newRequest(project)"><el-icon><Plus /></el-icon>提需求</button>
      </header>
      <section class="request-list" :aria-label="project.title+'修改需求'">
        <div v-if="project.requirements?.length" class="request-tools">
          <div class="filter-bar">
            <div class="quick-states" role="group" :aria-label="project.title+'需求状态'">
              <button v-for="option in quickStates" :key="option.value" type="button"
                :aria-pressed="quickState(project.id) === option.value" @click="filters[project.id] = option.value">
                {{ option.label }} <small>{{ counts[option.value] }}</small>
              </button>
            </div>
            <button type="button" class="filter-toggle" :aria-expanded="!!expanded[project.id]" :aria-controls="'more-filters-'+project.id"
              @click="expanded[project.id]=!expanded[project.id]"><el-icon><Filter /></el-icon>筛选</button>
          </div>
          <div v-if="periods[project.id]" class="active-filters">
            <button v-if="periods[project.id]" type="button" :aria-label="'取消近 '+periods[project.id]+' 天筛选'" @click="delete periods[project.id]">
              近 {{ periods[project.id] }} 天 <el-icon><Close /></el-icon>
            </button>
          </div>
          <div v-if="expanded[project.id]" :id="'more-filters-'+project.id" class="more-filters">
            <div class="filter-field" role="group" :aria-label="project.title+'提交时间'">
              <span>提交时间</span>
              <button v-for="option in issueTimeOptions" :key="option.days" type="button" :aria-pressed="(periods[project.id]||0)===option.days"
                @click="periods[project.id]=option.days">{{ option.label }}</button>
            </div>
          </div>
        </div>
        <div v-for="item in rows" :key="item.id" class="request-entry" :class="{'has-picture':item.firstImage?.url}">
          <button v-if="item.firstImage?.url" type="button" class="picture-button" :aria-label="'查看需求 #'+item.id+' 的图片，共 '+item.imageCount+' 张'"
            :aria-busy="previewing===item.id" @click="showImages(project,item)">
            <img :src="item.firstImage.url" loading="lazy" alt="" />
            <span>{{ previewing===item.id ? '加载中' : item.imageCount+' 张' }}</span>
          </button>
          <div class="request-content">
            <router-link class="request-row" :to="item.status==='confirm' && item.reviewId ? reviewRoute(project,item) : issueRoute(project,item)">
              <span class="request-main"><IssueNumber :id="item.id" /> <b>{{ item.title || (item.firstImage ? '截图需求' : '附件需求') }}</b></span>
              <RequirementStatus :status="item.status" />
              <el-icon class="chevron" aria-hidden="true"><ArrowRight /></el-icon>
              <small v-if="item.submittedAt" class="row-meta"><time>{{ item.submittedAt }} 提交</time></small>
            </router-link>
            <router-link v-if="item.latestTeamReply" class="reply-link" :to="issueRoute(project,item,item.latestTeamReply.id)">
              <i v-if="item.latestTeamReply.unread" class="unread" aria-label="未读"></i>
              <span class="reply-by">{{ item.latestTeamReply.by || '团队' }} <time :title="item.latestTeamReply.time">{{ replyTime(item.latestTeamReply.time) }}</time></span>
              <span class="reply-text">{{ replyText(item.latestTeamReply) }}</span><el-icon aria-hidden="true"><ArrowRight /></el-icon>
            </router-link>
          </div>
        </div>
        <div v-if="!rows.length" class="empty" role="status">
          <span>{{ project.requirements?.length ? '没有符合筛选条件的需求' : '还没有修改需求' }}</span>
          <button v-if="project.requirements?.length" type="button" @click="clearFilters(project.id)">清除筛选</button>
        </div>
      </section>
      <footer><router-link :to="'/projects/'+project.id"><el-icon><Document /></el-icon>项目详情</router-link>
        <router-link :to="{path:'/projects/'+project.id,query:{tab:'chat'}}"><el-icon><ChatDotRound /></el-icon>联系负责人<span v-if="hasNewReply(project)" class="reply-dot">新回复</span></router-link></footer>
    </article>
    <div v-if="orders.length && !groups.length" class="feedback" role="status">没有找到匹配的需求。<el-button link type="primary" @click="query=''">清除搜索</el-button></div>
  </main>
</template>

<script setup>
import IssueNumber from '@/components/IssueNumber.vue'
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ArrowDown, ArrowRight, ChatDotRound, Close, Document, Filter, FolderOpened, Plus, Search } from '@element-plus/icons-vue'
import { toast as ElMessage } from '@/utils/toast'
import { useCustomerOrders } from '@/customer/utils/useCustomerOrders'
import { hasNewReply } from '@/customer/utils/seen'
import { statusMap } from '@/customer/constants/options'
import { customerToken, getMyOrder } from '@/customer/mock/store'
import RequirementStatus from '@/customer/components/RequirementStatus.vue'
import { issueNumberQuery, issueTimeOptions, matchesIssueFilters, newestIssueFirst, useIssueFilterClock } from '@/utils/issueFilters'
import { imageEntries, openImage } from '@/utils/imagePreview'
import { issueRoute, reviewRoute, replyText, replyTime } from '@/customer/utils/requirementReplies'

const router = useRouter()
const {orders, loading, refreshing, error:loadError, load} = useCustomerOrders()
const quickStates = [{label:'全部',value:'all'},{label:'未解决',value:'unresolved'},{label:'已解决',value:'resolved'}]
const minute = useIssueFilterClock()
const saved = history.state?.customerView
const account = localStorage.getItem('customerAccount')
const restore = account && saved?.account === account && customerToken.value
const filters = reactive(restore ? Object.fromEntries(Object.entries(saved.filters || {}).map(([id, state]) =>
  [id, quickStates.some(option => option.value === state) ? state : 'unresolved'])) : {})
const periods = reactive(restore ? {...saved.periods} : {})
const expanded = reactive(restore ? {...saved.expanded} : {})
const query = ref(restore ? saved.query || '' : '')
onBeforeRouteLeave(() => {
  const view = {account, filters:{...filters}, periods:{...periods}, expanded:{...expanded}, query:query.value}
  history.replaceState({...history.state, customerView:view}, '')
})
function quickState(id) { return filters[id] || 'all' }
function clearFilters(id) {
  delete filters[id]
  delete periods[id]
}
function newRequest(project) {
  router.push({path:'/intake',query:{project:project.id}})
}
const single = computed(() => orders.value.length===1 ? orders.value[0] : null)
const total = computed(() => orders.value.reduce((sum,p) => sum+(p.requirements?.length || 0), 0))
// 团队已提交验收、等客户确认的项目
const toAccept = computed(() => orders.value.filter(p => p.status === 'review'))
// 待验收的项目里还没解决的修改需求有几条（客户刚点了「还有问题」，首页就别再只催验收了）
const openCount = (p) => (p.requirements || []).filter(item => (item.progressStatus || item.status || 'open') !== 'resolved').length
const waiting = computed(() => orders.value.flatMap(project =>
  (project.requirements || []).filter(item => item.status==='confirm' && item.reviewId).map(item => ({project,item}))
).sort((a,b) => String(b.item.reviewTime || '').localeCompare(String(a.item.reviewTime || '')) || b.item.reviewId-a.item.reviewId))
const groups = computed(() => {
  const term = query.value.normalize('NFKC').trim().toLowerCase()
  const numbered = /^(?:#|问题|需求)/.test(term) ? issueNumberQuery(term) : null
  const result = []
  for (const project of orders.value) {
    const matches = (project.requirements || []).filter(item => {
      if (numbered) return String(item.id) === numbered
      return !term || String(item.title || '附件需求').normalize('NFKC').toLowerCase().includes(term) || String(item.id).includes(term)
    })
    if (term && !matches.length) continue
    const days = periods[project.id] || 0
    const inPeriod = matches.filter(item => matchesIssueFilters(item, days, 'all', minute.value))
    const counts = {all:inPeriod.length, unresolved:0, resolved:0}
    for (const item of inPeriod) {
      const state = item.progressStatus || item.status || 'open'
      if (state === 'resolved') counts.resolved++
      else counts.unresolved++
    }
    const selected = filters[project.id] || 'all'
    const rows = inPeriod.filter(item => matchesIssueFilters(item, 0, selected, minute.value)).sort(newestIssueFirst)
    result.push({project,counts,rows})
  }
  return result
})

const previewing = ref(null)
let previewRequest = 0
onBeforeUnmount(() => { previewRequest++ })
async function showImages(project, item) {
  if (previewing.value === item.id) return
  previewing.value = item.id
  const request = ++previewRequest
  const token = customerToken.value
  const current = () => request === previewRequest && token && token === localStorage.getItem('customerToken')
  const context = '需求 #' + item.id
  const fallback = imageEntries([item.firstImage], context)
  let gallery = fallback
  try {
    if (item.imageCount > 1) {
      const detail = await getMyOrder(project.id)
      if (!current()) return
      const issue = detail.bugs?.find(bug=>String(bug.id)===String(item.id))
      if (!issue) {
        ElMessage.info('这条需求已更新，请刷新后查看')
        load()
        return
      }
      gallery = imageEntries(issue.attachments || [], context)
    }
  } catch (error) {
    if (!current()) return
    if (!/网络|超时|断开|连接|暂时繁忙|暂时不可用|network|failed to fetch|load failed/i.test(error.message || '')) {
      ElMessage.info(error.message || '暂时无法查看这组图片')
      load()
      return
    }
    ElMessage.warning('暂时只能查看首图，请稍后重试')
  } finally {
    if (request === previewRequest) previewing.value = null
  }
  if (gallery.length) {
    const first = gallery[0]
    openImage(first.url, first.name, first.file, gallery)
  } else {
    ElMessage.info('这条需求的图片已更新，请刷新后查看')
    load()
  }
}
</script>

<style scoped>
.project-home {--ink:#172d4d;--muted:#61748b;--border:#dce5ef;--pad:clamp(16px,2.4vw,30px);max-width:1120px;margin:auto;padding:clamp(22px,3.6vw,50px) clamp(16px,3.5vw,48px) 94px;color:var(--ink)}
.page-heading,.project-heading,.filter-bar,.quick-states,.filter-field,.request-search,.active-filters,footer,footer a,.create,.filter-toggle {display:flex;align-items:center}
.page-heading {justify-content:space-between;gap:14px;margin-bottom:20px}
.head-copy,.identity,.request-content {min-width:0}
h1,h2,p {margin:0}.head-copy h1 {font-size:clamp(24px,2.2vw,33px);line-height:1.32;overflow-wrap:anywhere;letter-spacing:-.035em}
.project-state {font-size:11px;line-height:1.6;font-weight:600;border-radius:5px;padding:1px 5px;background:#e7efff;color:#355c95}.head-copy p strong {font-weight:600;overflow-wrap:anywhere}.head-copy p,.identity p {display:flex;align-items:center;flex-wrap:wrap;gap:3px 12px;margin-top:5px;font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px}
.review-inbox {border:1px solid #f0d59c;color:#795018;background:#fffaf0;border-radius:12px;overflow:hidden;margin-bottom:14px}
.review-link,.review-inbox summary {display:flex;align-items:center;gap:10px;padding:11px 15px;color:inherit;min-height:44px}
.review-link {text-decoration:none}.review-link:hover {background:#fff3d9}
.review-count,.review-inbox summary {font-size:14px;font-weight:650}.review-count {flex:none}
.review-name {min-width:0;flex:1;font-size:14px;overflow-wrap:anywhere}.review-name small {display:block;font-size:12px;color:#746045;margin-top:2px}
.review-inbox summary {justify-content:space-between;cursor:pointer;list-style:none}
.review-inbox summary::-webkit-details-marker {display:none}.review-inbox details[open] summary .el-icon {transform:rotate(180deg)}
.accept-inbox .review-link+.review-link {border-top:1px solid #f3e8d0}
.accept-go {flex:none;padding:5px 12px;border-radius:999px;background:#1f5eff;color:#fff;font-size:13px;font-weight:600}
.review-list {border-top:1px solid #ecddbe;max-height:15rem;overflow:auto}.review-list .review-link+.review-link {border-top:1px solid #f3e8d0}
.request-search {gap:8px;margin-bottom:15px;background:#fff;border:1px solid var(--border);border-radius:11px;padding:10px 13px;color:var(--muted)}
.request-search:focus-within {outline:2px solid #7aa3e9}.request-search input {background:transparent;border:none;width:100%;min-width:0;outline:0;font:inherit;color:var(--ink);font-size:14px}
.project,.feedback {border:1px solid var(--border);box-shadow:0 6px 22px #213e6510;background:white;border-radius:16px;overflow:hidden;margin-bottom:18px}
.feedback {padding:18px;color:var(--muted)}
.project-heading {gap:12px;padding:18px var(--pad);background:#f5f8ff;border-bottom:1px solid #e4ebf5}
.folder {box-sizing:content-box;background:#e3edff;color:#295fc2;border-radius:10px;padding:9px;font-size:21px}
.identity {flex:1}.identity h2 {font-size:20px;line-height:1.4;overflow-wrap:anywhere}
.create {flex:none;justify-content:center;gap:5px;border:0;background:#215fdd;border-radius:10px;color:white;min-height:40px;padding:0 15px;font:600 14px/1.3 system-ui;cursor:pointer}
.create:hover {background:#164dbb}
.request-list {padding:0 var(--pad)}.request-tools {padding:13px 0;border-bottom:1px solid #e5ecf4}
.filter-bar {justify-content:space-between;gap:5px 8px;flex-wrap:wrap}
.quick-states {gap:3px;flex-wrap:wrap}
.quick-states button,.filter-toggle,.filter-field button,.active-filters button,.empty button {font:inherit;font-size:13px;cursor:pointer;border:0;color:#536984;background:transparent;border-radius:8px;padding:6px 9px;min-height:33px}
.quick-states button[aria-pressed=true],.filter-field button[aria-pressed=true] {background:#e8f0ff;color:#184eae;font-weight:650}
.quick-states small {font-size:12px;font-variant-numeric:tabular-nums}
.filter-toggle {gap:4px;background:#f1f4f9;color:#465c78}.filter-toggle[aria-expanded=true] {color:#2159b0;background:#e7effd}
.active-filters {flex-wrap:wrap;gap:5px;margin-top:8px}.active-filters button {display:inline-flex;gap:7px;align-items:center;color:#2154a8;background:#eef4fe;border-radius:18px;min-height:28px}
.more-filters {display:grid;gap:6px;padding:10px 12px;margin-top:9px;border-radius:9px;background:#f5f8fc}
.filter-field {flex-wrap:wrap;gap:2px 3px}.filter-field>span {font-size:12px;color:var(--muted);margin-right:4px}
.request-entry {display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;padding:15px 0;border-bottom:1px solid #e4ebf3}
.request-entry:last-child {border:0}.request-entry.has-picture {grid-template-columns:auto minmax(0,1fr)}
.picture-button {position:relative;overflow:hidden;cursor:zoom-in;width:65px;height:65px;flex:none;padding:0;border:1px solid #d7e2ed;border-radius:9px;background:#f4f7fb}
.picture-button img {display:block;width:100%;height:100%;object-fit:contain}
.picture-button span {position:absolute;right:2px;bottom:2px;background:#142436cf;border-radius:4px;color:white;font-size:11px;padding:1px 4px;line-height:1.5}
.request-row {display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:3px 8px;align-items:center;min-height:43px;text-decoration:none;color:var(--ink)}
.request-row:hover b {color:#1859c8}.request-main {min-width:0}.request-main b {font-size:16px;line-height:1.52;overflow-wrap:anywhere}
.chevron {color:#6a7d96;font-size:12px}
.row-meta {grid-column:1/-1;display:flex;flex-wrap:wrap;gap:3px 9px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.row-meta span {color:#4c6280;font-weight:600}
.reply-link {display:flex;align-items:center;gap:6px;min-height:32px;border-radius:7px;margin-top:7px;padding:4px 8px;color:#435a74;background:#f4f7fb;font-size:13px;text-decoration:none}
.reply-link:hover {background:#eaf2fe}.reply-by {color:#43648c;flex:none}.reply-text {flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.unread {flex:none;background:#df464a;width:7px;height:7px;border-radius:50%}
.empty {padding:24px 0;color:var(--muted);font-size:14px}.empty button {color:#1959be}
footer {border-top:1px solid #e1e9f3;gap:22px;padding:4px var(--pad);background:#fafcff}
footer a {gap:6px;color:#3a5982;text-decoration:none;font-size:13px;min-height:38px}.reply-dot {color:#b43238;font-size:12px}
.project-home :is(a,button):focus-visible {outline:2px solid #477ed7;outline-offset:1px}
@media(max-width:768px){
  .project-home {--pad:14px;padding:21px 12px 90px}.page-heading {margin:0 3px 13px}.head-copy h1 {font-size:23px}
  .head-copy p {font-size:12px}.create {min-height:38px;padding:0 11px}.project-heading {padding-block:14px}.identity h2 {font-size:17px}
  .project {border-radius:14px}.request-search {margin-bottom:12px}.quick-states {gap:2px}.quick-states button {padding:6px 7px}
  .request-tools {padding:10px 0}.filter-toggle {padding:5px 7px}.more-filters {padding:6px 8px}
  .request-entry {gap:8px;padding:12px 0}.picture-button {width:52px;height:58px}.request-main b {font-size:15px}
  .request-row {gap:5px 4px}.request-row .chevron {display:none}.request-row {grid-template-columns:minmax(0,1fr) auto}
  .request-content {display:contents}.request-row {grid-column:-2/-1}
  .reply-link {grid-column:1/-1;gap:5px;margin-top:0;padding:5px 7px;min-height:34px}.reply-by time {font-size:11px}
  .reply-text {display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal;overflow-wrap:anywhere}
}
</style>
