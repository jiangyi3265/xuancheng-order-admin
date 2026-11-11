<template>
  <div class="detail-page">
    <header class="topbar">
      <button type="button" class="back" :aria-label="listBackLabel()" @click="backToProjects"><el-icon :size="20"><ArrowLeft /></el-icon></button>
      <div class="tt">
        <strong>{{ order?.title || '项目详情' }}</strong>
        <span v-if="order">{{ detailTab === 'bugs' ? order.orderNo : (subtitle) }}</span>
      </div>
      <el-tag v-if="order" :class="'project-status-'+order.status" size="small" :type="statusMap[order.status]?.type">
        {{ statusMap[order.status]?.label || order.status }}
      </el-tag>
      <el-button
        v-if="order && syncState === 'reconnecting'"
        text
        type="warning"
        :icon="Refresh"
        :loading="syncing"
        @click="syncNow"
      >重新连接</el-button>
      <el-button v-if="order && order.channel === 'form' && order.status === 'pending' && !order.bugs?.length" text type="danger" @click="removeOrder">撤回</el-button>
    </header>

    <section v-if="order && detailTab==='overview'" class="customer-project-summary">
      <ProgressSteps :status="order.status" :deadline="order.deadline" class="summary-progress" />
      <p v-if="order.status === 'review'" class="accept-hint" role="status">团队已经交付，请检查一下。没问题点「确认验收」，有不满意的地方点「还有问题」。</p>
      <div class="info-row summary-price"><label><el-icon><PriceTag/></el-icon> 报价：</label><span v-if="Number(order.amount)">{{ money(order.amount) }}</span><span v-else class="summary-unpriced">待报价</span></div>
      <div class="info-row"><label><el-icon><Calendar/></el-icon> 截止日期：</label><span>{{ order.deadline || '未设置' }}</span></div>
      <div class="info-row"><label><el-icon><User/></el-icon> 负责团队：</label><span>{{ TEAM_NAME }}</span></div>
    </section>
    <nav v-if="order" class="detail-tabs" aria-label="项目详情分区"><button v-for="t in detailTabs" :key="t.key" :aria-current="detailTab===t.key ? 'page' : undefined" :class="{active:detailTab===t.key}" @click="detailTab=t.key">{{ t.label }}<i v-if="t.key==='chat' && chatHasNew" class="tab-new-dot" aria-hidden="true" title="团队有新回复"></i></button></nav>
    <main ref="scroller" class="scroll" @scroll.passive="onChatScroll">
      <div v-if="loading" class="state"><el-icon class="loading"><Loading /></el-icon> 加载中...</div>

      <div v-else-if="loadError && !order" class="state error-state">
        <strong>项目暂时没有打开</strong>
        <span>{{ loadError }}</span>
        <div>
          <el-button :icon="ArrowLeft" @click="backToProjects">{{ listOriginPath() === '/customer/messages' ? '返回消息列表' : '返回项目' }}</el-button>
          <el-button type="primary" :icon="Refresh" @click="load(true)">重新加载</el-button>
        </div>
      </div>

      <template v-else-if="order">
        <section v-show="detailTab==='bugs'" class="bug-section" :class="{ 'is-open': bugPanelOpen }">
          <div class="bug-head">
            <button v-if="issueId" type="button" class="all-issues" @click="resetIssueFilters(); showProjectIssues()"><el-icon><ArrowLeft /></el-icon>全部修改需求</button>
            <button v-else type="button" class="bug-summary" :aria-expanded="bugPanelOpen" @click="toggleBugPanel">
              <strong>修改需求</strong>
              <span>{{ hasIssueFilters ? filteredBugs.length + ' / ' + bugItems.length : bugItems.length }} 条</span>
              <el-icon><ArrowUp v-if="bugPanelOpen"/><ArrowDown v-else/></el-icon>
            </button>
            <el-button size="small" type="primary" plain :icon="CirclePlus" @click="openBugCreate">{{ issueId ? '另提一条' : '反馈问题' }}</el-button>
          </div>
          <transition name="bug-panel">
            <div v-if="issueId || bugPanelOpen" class="bug-panel">
              <div v-if="!issueId && bugItems.length" class="issue-filters">
                <div class="filter-row" role="group" aria-label="按提交时间筛选">
                  <span>提交时间</span>
                  <button v-for="option in issueTimeOptions" :key="option.days" type="button"
                    :aria-pressed="issueDays === option.days" @click="issueDays = option.days">{{ option.label }}</button>
                </div>
                <div class="filter-row" role="group" aria-label="按解决状态筛选">
                  <span>处理状态</span>
                  <button v-for="option in issueStateOptions" :key="option.value" type="button"
                    :aria-pressed="issueState === option.value" @click="issueState = option.value">{{ option.label }}</button>
                </div>
              </div>
              <p v-if="targetUpdateId && focusedBug && !focusedBug.updates?.some(reply => String(reply.id) === targetUpdateId)"
                class="empty-bugs" role="status">这条回复已不可见，可以继续查看本条需求。</p>
              <div class="bug-list">
                <article v-for="bug in visibleBugs" :key="bug.id" :id="'requirement-'+bug.id" class="bug-item" :class="{'is-resolved':isBugResolved(bug)}">
                  <div v-if="issueId && staleReviewLink" class="stale-review" role="status">
                    这次确认已结束。<button type="button" @click="viewLatest(bug)">查看最新需求</button>
                  </div>
                  <IssueReview v-else-if="issueId && bug.review" :key="bug.review.id" :issue-id="bug.id" :review="bug.review"
                    :pending="isPendingReview(bug) && !projectClosed" :adjusting="reviewAdjusting"
                    :busy="!!statusUpdatingBugId || !!updateDraft?.sending || !!updateDraft?.annotating"
                    :remaining-count="!projectClosed && isBugResolved(bug) && bug.review.state === 'accepted' ? pendingReviews.length : undefined"
                    :back-label="listBackLabel()" @accept="acceptReview(bug)" @adjust="startAdjustment(bug)"
                    @next="viewLatest(pendingReviews[0])" @back="backToProjects" />
                  <div class="bug-body" :class="{'split-record': issueId && historyFor(bug).length}">
                    <div class="issue-original">
                    <div class="issue-heading"><strong><el-icon aria-hidden="true"><Document /></el-icon>需求 #{{ bug.id }}</strong><RequirementStatus :status="bug.progressStatus || bug.status" /></div>
                    <p class="issue-description"><LinkText :text="bug.content || '附件需求'" /></p>
                    <AttachmentView v-if="bug.attachments?.length" :items="bug.attachments" :gallery="problemImages" :size="82" />
                    <div class="bug-meta">{{ bug.createdBy || '客户' }} 提交<template v-if="bug.time"><span>·</span><time :title="fmtTime(bug.time)">{{ friendlyTime(bug.time) }}</time></template></div>

                    </div>
                    <div v-if="historyFor(bug).length" class="bug-updates">
                      <h3>补充记录 <small>{{ historyFor(bug).length }}</small></h3>
                      <div v-for="u in historyFor(bug)" :key="u.id" class="bug-update" :id="'issue-reply-'+u.id"
                        :class="{'target-reply': issueId && targetUpdateId === String(u.id)}" :data-team-reply="u.senderKind === 'team' ? u.id : undefined">
                        <div class="update-meta"><strong v-if="u.senderKind === 'team'">团队回复</strong>{{ u.createdBy || '客户' }} · <time :title="fmtTime(u.time)">{{ friendlyTime(u.time) }}</time></div>
                        <p><LinkText :text="u.content || '只有附件'"/></p>
                        <AttachmentView v-if="u.attachments && u.attachments.length" :items="u.attachments" :gallery="problemImages" :size="64" />
                      </div>
                    </div>

                    <div v-if="!issueId && activeUpdateBugId === bug.id" class="bug-update-form" data-paste-zone="追加说明">
                      <el-input
                        v-model="updateDraft.text" :disabled="updateDraft.sending"
                        type="textarea"
                        :rows="2"
                        resize="none"
                        placeholder="补充新的说明或变更，可以粘贴截图"
                      />
                      <AttachmentUploader :key="bug.id" :draft="updateDraft" class="bug-upload" />
                      <el-button type="primary" :loading="updateDraft.sending" :disabled="!!updateDraft.annotating || !!updateDraft.attachmentWaitList.length || statusUpdatingBugId === bug.id" @click="submitBugUpdate(bug)">
                        提交补充
                      </el-button>
                    </div>
                  </div>
                  <div class="bug-actions">
                    <el-button v-if="!issueId && isPendingReview(bug)" type="primary" plain size="small" @click="viewLatest(bug)">查看本次修改</el-button>
                    <el-button v-if="!isPendingReview(bug) && !staleReviewLink && !isBugResolved(bug)" plain size="small" :disabled="!!statusUpdatingBugId || !!updateDraft?.sending"
                      :loading="statusUpdatingBugId===bug.id" @click="changeBugStatus(bug, 'resolved')">确认已解决</el-button>
                    <el-button v-if="!isPendingReview(bug) && !staleReviewLink && (issueId || isBugResolved(bug))" text type="primary" :icon="CirclePlus"
                      :disabled="!!statusUpdatingBugId || !!updateDraft?.sending || (isBugResolved(bug) && projectClosed)"
                      @click="startAdjustment(bug)">还要调整</el-button>
                    <el-button v-if="!issueId" text type="primary" :icon="CirclePlus" @click="toggleBugUpdate(bug)">
                      {{ activeUpdateBugId === bug.id ? '收起' : '补充说明' }}
                    </el-button>
                    <el-dropdown trigger="click" class="issue-more">
                      <el-button text aria-label="更多操作">更多 <el-icon><ArrowDown /></el-icon></el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item v-if="issueId && isPendingReview(bug) && !staleReviewLink && !showIssueComposer" @click="openOrdinaryComposer">补充说明</el-dropdown-item>
                          <el-dropdown-item @click="copyIssueLink(bug)">复制需求链接</el-dropdown-item>
                          <el-dropdown-item divided :disabled="!!deletingBugId" @click="removeBug(bug)">删除需求</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </article>
                <div v-if="!visibleBugs.length" class="empty-bugs" role="status">
                  <template v-if="issueId">这条需求已移除或无法查看。</template>
                  <template v-else-if="bugItems.length">
                    没有符合筛选条件的需求
                    <button type="button" class="clear-filters" @click="resetIssueFilters">清除筛选</button>
                  </template>
                  <template v-else>还没有修改需求</template>
                </div>
              </div>
            </div>
          </transition>
        </section>

        <section v-show="detailTab==='overview'" class="info">
          <div class="info-row col"><label>需求内容</label><p><LinkText :text="order.requirement || '-'"/></p></div>
          <div v-if="order.attachments && order.attachments.length" class="info-row col">
            <label>需求材料</label>
            <div class="mats">
              <MediaThumb v-for="(m, i) in order.attachments" :key="i" :item="m" :size="76" :siblings="order.attachments" />
            </div>
          </div>
        </section>

        <div v-show="detailTab==='chat'" class="chat-title">
          <span>沟通</span>
        </div>

        <div v-show="detailTab==='chat'" class="chat">
          <template v-for="({item:t, day, meta}, i) in chatRows" :key="t.id || i">
          <div v-if="day" class="chat-day">{{ day }}</div>
          <ChatMessage :show-meta="meta"
            :item="t"
            :mine="t.type === 'message'"
          />
          </template>
          <div v-if="!chatItems.length" class="empty-chat">
            还没有沟通消息，发一条给团队
          </div>
        </div>
      </template>
    </main>

    <div v-if="order && detailTab==='overview' && order.status === 'review'" class="detail-footer"><el-button @click="detailTab='bugs'; openBugCreate()"><el-icon><ChatDotRound/></el-icon>还有问题</el-button><el-button type="primary" :loading="accepting" @click="confirmAccept"><el-icon><CircleCheck/></el-icon>确认验收</el-button></div>
    <div v-else-if="order && detailTab==='overview'" class="detail-footer"><el-button @click="detailTab='chat'"><el-icon><Phone/></el-icon>联系负责人</el-button><el-button type="primary" @click="detailTab='bugs'; openBugCreate()"><el-icon><ChatDotRound/></el-icon>反馈问题</el-button></div>
    <el-dialog v-model="bugCreateOpen" title="反馈问题" :close-on-click-modal="false" class="customer-issue-dialog" align-center append-to-body><section class="bug-associated"><small>关联项目</small><h3>{{ order?.title }}</h3></section><el-form label-position="top" data-paste-zone="反馈问题"><el-form-item label="问题说明"><el-input v-model="bugDraft.text" :disabled="bugDraft.sending" type="textarea" :rows="7" placeholder="请描述具体问题、出现位置及预期效果"/></el-form-item><el-form-item label="截图 / 相关文件"><AttachmentUploader :draft="bugDraft" class="bug-upload"/></el-form-item></el-form><p class="muted">提交后负责人会收到通知，你可以在问题列表查看处理进度。</p><template #footer><el-button @click="bugCreateOpen=false">取消</el-button><el-button type="primary" :loading="bugDraft.sending" :disabled="!!bugDraft.annotating || !!bugDraft.attachmentWaitList.length" @click="submitBug">提交反馈</el-button></template></el-dialog>
    <MessageComposer v-if="showIssueComposer && updateDraft" :key="reviewAdjusting ? 'review-'+focusedBug.review.id : focusedBug.id" ref="issueComposer" issue
      :draft="updateDraft" :adjusting="adjusting" :reviewing="reviewAdjusting" :reference-image="focusedBug.review?.afterImage"
      :blocked="statusUpdatingBugId===focusedBug.id || deletingBugId===focusedBug.id" @cancel-adjust="cancelAdjustment" @send="submitBugUpdate(focusedBug)" />
    <button v-if="detailTab==='chat' && hasNewChat" class="new-chat-jump" @click="scrollBottom()">有新消息 ↓</button>
    <MessageComposer v-if="order && detailTab==='chat'" :draft="draft" @send="onSend" />
  </div>
</template>

<script setup>
import LinkText from '@/components/LinkText.vue'
import { friendlyTime, fmtTime } from '@/utils/time'
import { chatGroup, useChatArrival } from '@/utils/chatDisplay'
import { money } from '@/utils/payment'
import { Document } from '@element-plus/icons-vue'
import { computed, ref, toRefs, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { toast as ElMessage } from '@/utils/toast'
import { ArrowLeft, Loading, CirclePlus, ArrowDown, ArrowUp, Refresh } from '@element-plus/icons-vue'
import { useVisibleIssueReplies } from '@/customer/utils/useVisibleIssueReplies'
import { issueGallery } from '@/utils/imagePreview'
import { issueStateOptions, issueTimeOptions, matchesIssueFilters, newestIssueFirst, useIssueFilterClock } from '@/utils/issueFilters'
import MediaThumb from '@/customer/components/MediaThumb.vue'
import AttachmentUploader from '@/customer/components/AttachmentUploader.vue'
import AttachmentView from '@/customer/components/AttachmentView.vue'
import RequirementStatus from '@/customer/components/RequirementStatus.vue'
import ChatMessage from '@/customer/components/ChatMessage.vue'
import { chatDraft, sendDraft } from '@/utils/chatDraft'
import MessageComposer from '@/customer/components/MessageComposer.vue'
import ProgressSteps from '@/customer/components/ProgressSteps.vue'
import { markSeen, hasNewReply } from '@/customer/utils/seen'
import IssueReview from '@/customer/components/IssueReview.vue'
import { customerToken, decideIssueReview } from '@/customer/mock/store'
import { getMyOrder, getMyOrderVersion, removeMyOrder, createBug, deleteBug, appendBugUpdate, updateBugStatus, sendMessage, acceptMyOrder } from '@/customer/mock/store'
import { statusMap, priorityMap, TEAM_NAME } from '@/customer/constants/options'

const route = useRoute()
const detailTab = computed({
  get: () => ['chat','bugs'].includes(route.query.tab) ? route.query.tab : 'overview',
  set: tab => {
    const query = {...route.query, tab:tab === 'overview' ? undefined : tab}
    if (tab !== 'bugs') { delete query.issue; delete query.update; delete query.adjust; delete query.review; delete query.compose }
    router.replace({path:route.path, query})
  }
})
const detailTabs=[{key:'overview',label:'项目概况'},{key:'chat',label:'沟通'},{key:'bugs',label:'修改需求'}]
const router = useRouter()
const id = route.params.id
const order = ref(null)
function listOriginPath() {
  return history.state?.back?.split(/[?#]/, 1)[0]
}
function listBackLabel() {
  return listOriginPath() === '/customer/messages' ? '返回消息列表' : '返回列表'
}
function backToProjects() {
  if (['/projects', '/customer/messages'].includes(listOriginPath())) return router.back()
  return router.push('/projects')
}
function showProjectIssues() {
  if (route.params.id !== id) return
  router.replace({path:route.path, query:{...route.query, tab:'bugs', issue:undefined, update:undefined, adjust:undefined, review:undefined, compose:undefined}})
}
function applySnapshot(snapshot) {
  if (snapshot && String(snapshot.id) === String(id) &&
      Number(snapshot.version || 0) >= Number(order.value?.version || 0)) order.value = snapshot
}
const loading = ref(true)
const loadError = ref('')
const syncState = ref('online')
const syncing = ref(false)
const draft = chatDraft('customer', id)
const { sending } = toRefs(draft)
const bugPanelOpen = ref(detailTab.value === 'bugs')
const bugCreateOpen = ref(false)
const bugDraft = chatDraft('customer', id, 'issue')
const deletingBugId = ref(null)
const statusUpdatingBugId = ref(null)
const activeUpdateBugId = ref(null)
const updatesInFlight = ref(0)
const scroller = ref(null)
const { hasNew: hasNewChat, onScroll: onChatScroll, onArrival } = useChatArrival(scroller)
let poller = null

const chatItems = computed(() => (order.value?.timeline || []).filter((t) => t.type === 'message' || t.type === 'reply'))
const chatRows = computed(() => chatItems.value.map((item, i, items) => ({ item, ...chatGroup(item, items[i - 1]) })))
watch(() => chatItems.value.at(-1)?.id, (last, old) => {
  if (old != null && last != null && detailTab.value === 'chat') onArrival(scrollBottom)
})

// 团队有新回复：「沟通」上亮红点；打开沟通看过就记下，列表和消息页的红点一起灭
const lastChat = computed(() => chatItems.value[chatItems.value.length - 1])
const chatHasNew = computed(() => detailTab.value !== 'chat' && hasNewReply({ id, lastMessage: lastChat.value }))
function markVisibleChatSeen() {
  if (!document.hidden && detailTab.value === 'chat' && lastChat.value) markSeen(id, lastChat.value)
}
watch([detailTab, lastChat], markVisibleChatSeen, { immediate: true })
const issueDays = ref(0)
const issueState = ref('all')
const currentMinute = useIssueFilterClock()
const hasIssueFilters = computed(() => issueDays.value !== 0 || issueState.value !== 'all')
const bugItems = computed(() => [...(order.value?.bugs || [])].sort(newestIssueFirst))
const filteredBugs = computed(() => hasIssueFilters.value
  ? bugItems.value.filter(bug => matchesIssueFilters(bug, issueDays.value, issueState.value, currentMinute.value))
  : bugItems.value)
function resetIssueFilters() {
  issueDays.value = 0
  issueState.value = 'all'
}
const issueId = computed(() => detailTab.value === 'bugs' ? String(route.query.issue || '') : '')
const visibleBugs = computed(() => issueId.value
  ? bugItems.value.filter(bug => String(bug.id) === issueId.value)
  : filteredBugs.value)
const focusedBug = computed(() => issueId.value ? visibleBugs.value[0] : null)
const linkedReview = computed(() => issueId.value ? String(route.query.review || '') : '')
const staleReviewLink = computed(() => !!linkedReview.value && !!focusedBug.value && String(focusedBug.value.review?.id || '') !== linkedReview.value)
function isPendingReview(bug) {
  return bug?.review?.state === 'pending' && (bug.progressStatus || bug.status) === 'confirm'
}
const pendingReviews = computed(() => bugItems.value.filter(isPendingReview).sort((a, b) =>
  String(b.review.time || '').localeCompare(String(a.review.time || '')) || b.review.id - a.review.id
))
watch(() => [issueId.value, focusedBug.value?.review?.id, route.query.review], () => {
  const bug = focusedBug.value
  if (isPendingReview(bug) && !linkedReview.value) {
    router.replace({path:route.path,query:{...route.query,review:String(bug.review.id)}})
  }
}, {immediate:true})
function historyFor(bug) {
  const updates = bug.updates || []
  return issueId.value && bug.review ? updates.filter(u => String(u.id) !== String(bug.review.id)) : updates
}
function navigateToIssue(query) {
  const target = {path:route.path, query}
  return issueId.value || listOriginPath() === '/customer/messages' ? router.replace(target) : router.push(target)
}
async function viewLatest(bug) {
  if (!bug) return
  await navigateToIssue({tab:'bugs', issue:String(bug.id), review:bug.review?.id})
  await nextTick()
  scroller.value?.scrollTo({top:0})
  if (bug.review) document.getElementById('issue-reply-' + bug.review.id)?.focus({preventScroll:true})
}
async function openOrdinaryComposer() {
  await router.replace({path:route.path,query:{...route.query, adjust:undefined, compose:'1'}})
  await nextTick()
  issueComposer.value?.focus()
}
const targetUpdateId = computed(() => issueId.value ? String(route.query.update || '') : '')
const projectClosed = computed(() => ['done','cancelled'].includes(order.value?.status))
const adjusting = computed(() => !!focusedBug.value && !isPendingReview(focusedBug.value) && route.query.adjust === '1' && !projectClosed.value)
const reviewAdjusting = computed(() => route.query.adjust === 'review' && !!linkedReview.value && !staleReviewLink.value && isPendingReview(focusedBug.value) && !projectClosed.value)
const showIssueComposer = computed(() => !!focusedBug.value && !staleReviewLink.value && (route.query.adjust === 'review' ? reviewAdjusting.value : !isPendingReview(focusedBug.value) || route.query.compose==='1'))
const updateDraft = computed(() => {
  const bugId = focusedBug.value?.id ?? activeUpdateBugId.value
  if (reviewAdjusting.value) return chatDraft('customer', id, 'issue-review-'+bugId+'-'+linkedReview.value)
  return bugId == null ? null : chatDraft('customer', id, 'issue-update-' + bugId)
})
const issueComposer = ref(null)
const readableIssue = computed(() => staleReviewLink.value ? null : focusedBug.value)
const {refreshVisibleReplies} = useVisibleIssueReplies(id, readableIssue, targetUpdateId, scroller)
const problemImages = computed(() => issueGallery(visibleBugs.value))
watch(visibleBugs, items => {
  if (activeUpdateBugId.value != null && !items.some(bug => bug.id === activeUpdateBugId.value)) activeUpdateBugId.value = null
})
watch(detailTab, tab => { if (tab === 'bugs') bugPanelOpen.value = true })
watch(issueId, () => { activeUpdateBugId.value = null; if (!targetUpdateId.value) nextTick(() => scroller.value?.scrollTo({top:0})) })
// 标题下面那行：需求第一行和项目名一样时（客户经常只写一句），改显示编号，不再重复两遍
const subtitle = computed(() => {
  const first = String(order.value?.requirement || '').split('\n')[0].trim()
  return first && first !== String(order.value?.title || '').trim() ? first : order.value?.orderNo || ''
})

// 确认验收：团队提交验收后，客户自己点确认，项目直接变成「已完成」，负责人会收到提醒
const accepting = ref(false)
async function confirmAccept() {
  if (accepting.value) return
  try {
    await ElMessageBox.confirm('项目已经按要求完成了吗？确认后会标记为「已完成」，团队会收到通知。', '确认验收', {
      confirmButtonText: '确认验收',
      cancelButtonText: '再看看',
      type: 'success'
    })
  } catch {
    return
  }
  accepting.value = true
  try {
    order.value = await acceptMyOrder(id)
    ElMessage.success('已确认验收，感谢配合！')
  } catch (e) {
    ElMessage.error(e.message || '确认失败，请稍后重试')
    await load(false, true)
  } finally {
    accepting.value = false
  }
}

function bugStatus(bug) {
  return (bug?.progressStatus || bug?.status) === 'resolved' ? 'resolved' : 'open'
}

function isBugResolved(bug) {
  return bugStatus(bug) === 'resolved'
}

watch(detailTab, tab => { if(tab==='chat') scrollBottom(); else if (!route.query.issue || tab!=='bugs') nextTick(()=>scroller.value?.scrollTo({top:0})) })

function scrollBottom(smooth = false, retry = 2) {
  if(detailTab.value!=='chat') return
  hasNewChat.value = false
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    if (retry > 0) {
      window.requestAnimationFrame(() => scrollBottom(false, retry - 1))
    }
  })
}

function toggleBugPanel() {
  bugPanelOpen.value = !bugPanelOpen.value
}

function openBugCreate() {
  bugPanelOpen.value = true
  bugCreateOpen.value = true
}

async function load(scroll = true, silent = false) {
  if (!silent && !order.value) loading.value = true
  try {
    const vo = await getMyOrder(id)
    applySnapshot(vo)
    loadError.value = ''
    syncState.value = 'online'
    if (scroll) scrollBottom()
  } catch (e) {
    if (silent) {
      syncState.value = 'reconnecting'
    } else {
      loadError.value = e.message || '网络连接失败，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

async function syncNow() {
  if (!order.value || syncing.value || document.visibilityState !== 'visible') return
  refreshVisibleReplies()
  if (sending.value || bugDraft.sending || deletingBugId.value || statusUpdatingBugId.value || updatesInFlight.value) return
  syncing.value = true
  try {
    const version = await getMyOrderVersion(id)
    if (Number(version?.version || 0) !== Number(order.value.version || 0)) {
      await load(false, true)
    } else {
      syncState.value = 'online'
    }
  } catch (e) {
    syncState.value = 'reconnecting'
  } finally {
    syncing.value = false
  }
}

async function onSend() {
  if (sending.value) return
  try {
    const vo = await sendDraft(draft, ({content, attachments}) => sendMessage(id, content, attachments))
    if (vo) applySnapshot(vo)
    scrollBottom(true)
  } catch (e) {
    ElMessage.error(e.message || '发送失败')
  }
}

async function submitBug() {
  if (bugDraft.sending || bugDraft.annotating || bugDraft.attachmentWaitList.length) return
  if (!bugDraft.text.trim() && !bugDraft.files.length) return ElMessage.warning('先写说明或粘贴截图')
  const origin = route.fullPath
  try {
    const vo = await sendDraft(bugDraft, ({content, attachments}) => createBug(id, content, attachments))
    if (!vo || route.params.id !== id) return
    applySnapshot(vo)
    bugPanelOpen.value = true
    bugCreateOpen.value = false
    if (route.fullPath === origin) {
      if (issueState.value === 'resolved') issueState.value = 'all'
      currentMinute.value = Math.floor(Date.now() / 60000)
      if (issueId.value) showProjectIssues()
    }
    ElMessage.success('问题已记下')
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  }
}

async function removeBug(bug) {
  try {
    await ElMessageBox.confirm('删除后双方都看不到这条问题，确定删除吗？', '删除问题', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deletingBugId.value = bug.id
    const vo = await deleteBug(bug.id)
    applySnapshot(vo)
    if (String(bug.id) === issueId.value) showProjectIssues()
    ElMessage.success('问题已删除')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  } finally {
    deletingBugId.value = null
  }
}

async function changeBugStatus(bug, status) {
  if (!bug || statusUpdatingBugId.value || bugStatus(bug) === status) return
  const projectId = order.value.id
  statusUpdatingBugId.value = bug.id
  try {
    const vo = await updateBugStatus(bug.id, status === 'open' ? 'reopen' : status)
    if (order.value?.id !== projectId) return
    applySnapshot(vo)
    ElMessage.success(status === 'resolved' ? '已标记已解决' : '已重新激活，等待处理')
  } catch (e) {
    ElMessage.error(e.message || '状态更新失败')
  } finally {
    statusUpdatingBugId.value = null
  }
}

async function startAdjustment(bug) {
  const query = {tab:'bugs', issue:String(bug.id)}
  if (isPendingReview(bug)) Object.assign(query,{review:String(bug.review.id), adjust:'review'})
  else if (isBugResolved(bug)) query.adjust='1'
  await navigateToIssue(query)
  await nextTick()
  issueComposer.value?.focus()
}
function cancelAdjustment() {
  router.replace({path:route.path, query:{...route.query, adjust:undefined, compose:undefined}})
}

function publishDecision(bugId, reviewId, status, owner) {
  if (!owner || owner !== customerToken.value || owner !== localStorage.getItem('customerToken')) return
  window.dispatchEvent(new CustomEvent('customer-issue-reviewed', {
    detail:{projectId:id,issueId:bugId,reviewId,status,account:localStorage.getItem('customerAccount')}
  }))
}
async function acceptReview(bug) {
  if (!isPendingReview(bug) || staleReviewLink.value || projectClosed.value || statusUpdatingBugId.value || updateDraft.value?.sending) return
  const reviewId = bug.review.id
  const owner = customerToken.value
  statusUpdatingBugId.value = bug.id
  try {
    const vo = await decideIssueReview(bug.id, reviewId, 'accept')
    applySnapshot(vo)
    publishDecision(bug.id, reviewId, 'resolved', owner)
    ElMessage.success(pendingReviews.value.length ? '已确认，这条需求已解决' : '已确认，本项目暂无其他待确认需求')
  } catch (e) {
    ElMessage.error(e.message || '确认失败，请重试')
    await load(false, true)
  } finally {
    statusUpdatingBugId.value = null
  }
}
async function copyIssueLink(bug) {
  const url = new URL('/client/', window.location.origin)
  url.hash = '/projects/' + id + '?tab=bugs&issue=' + bug.id
  try {
    await navigator.clipboard.writeText(url.href)
    ElMessage.success('需求链接已复制')
  } catch {
    ElMessageBox.prompt('长按或选中下方链接即可手动复制。', '复制需求链接', {
      inputValue:url.href, showCancelButton:false, confirmButtonText:'关闭'
    }).catch(() => {})
  }
}
function toggleBugUpdate(bug) {
  activeUpdateBugId.value = activeUpdateBugId.value === bug.id ? null : bug.id
}

async function submitBugUpdate(bug) {
  const current = updateDraft.value
  if (!current || current.sending || current.annotating || current.uploading || current.attachmentWaitList.length || statusUpdatingBugId.value === bug.id) return
  if (!current.text.trim() && !current.files.length) return ElMessage.warning('先写追加说明或粘贴截图')
  const reviewId = reviewAdjusting.value ? bug.review.id : null
  const owner = customerToken.value
  if (staleReviewLink.value || (route.query.adjust === 'review' && !reviewId)) return
  updatesInFlight.value++
  try {
    const reopen = adjusting.value
    const origin = route.fullPath
    const vo = await sendDraft(current, ({content, attachments}) => {
      if (reviewId) return decideIssueReview(bug.id, reviewId, 'adjust', content, attachments)
      const fingerprint = JSON.stringify({content, attachments, reopen})
      if (current.retry?.fingerprint !== fingerprint) {
        const key = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), n=>n.toString(16).padStart(2,'0')).join('')
        current.retry = {fingerprint, key}
      }
      return appendBugUpdate(bug.id, content, attachments, {requestKey:current.retry.key, reopen})
    })
    if (!vo) return
    applySnapshot(vo)
    if (reviewId) publishDecision(bug.id, reviewId, 'action', owner)
    if (route.fullPath !== origin) return
    if (reopen || reviewId) cancelAdjustment()
    if (activeUpdateBugId.value === bug.id) activeUpdateBugId.value = null
    ElMessage.success(reviewId ? '调整已提交给负责人' : reopen ? '需求已重新打开，说明已发送' : '已补充说明')
  } catch (e) {
    ElMessage.error(e.message || '补充失败')
    if (reviewId) await load(false, true)
  } finally {
    updatesInFlight.value--
  }
}

async function removeOrder() {
  try {
    await ElMessageBox.confirm(
      '撤回后你将看不到这个问题。只有还没开始处理的问题可以撤回；如果是误操作，请联系我们恢复。确定撤回吗？',
      '撤回问题',
      {
        type: 'warning',
        confirmButtonText: '撤回',
        cancelButtonText: '取消'
      }
    )
    await removeMyOrder(id)
    ElMessage.success('已撤回')
    router.push('/projects')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

onMounted(() => {
  load(true)
  poller = setInterval(syncNow, 2000)
  window.addEventListener('focus', syncNow)
  document.addEventListener('visibilitychange', syncNow)
  document.addEventListener('visibilitychange', markVisibleChatSeen)
})

onBeforeUnmount(() => {
  if (poller) clearInterval(poller)
  window.removeEventListener('focus', syncNow)
  document.removeEventListener('visibilitychange', syncNow)
  document.removeEventListener('visibilitychange', markVisibleChatSeen)
})
</script>

<style scoped>
.detail-page {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
}
.topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fdfefe;
  padding: 12px 14px;
  border-bottom: 1px solid #ebeef5;
}
.back {
  display: inline-flex; align-items: center; border: 0; background: transparent; padding: 6px;
  cursor: pointer;
  color: #606266;
}
.tt {
  flex: 1;
  min-width: 0;
}
.tt strong {
  display: block;
  font-size: 16px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tt span {
  font-size: 12px;
  color: #c0c4cc;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.state {
  text-align: center;
  color: #909399;
  padding: 40px 0;
}
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.error-state strong {
  color: #303133;
  font-size: 17px;
}
.error-state span {
  max-width: 32rem;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}
.loading {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.info {
  background: #fdfefe;
  border-radius: 8px;
  padding: 14px;
}
.tab-new-dot { display: inline-block; width: 7px; height: 7px; margin-left: 4px; border-radius: 50%; background: #f56c6c; vertical-align: top; }
.summary-progress { margin: 10px 0 6px; }
.summary-unpriced { color: #8592a6 !important; font-size: 15px !important; font-weight: 500 !important; }
.accept-hint { margin: 10px 0 4px; padding: 10px 12px; border-radius: 10px; background: #fdf6ec; color: #8a5a12; font-size: 14px; line-height: 1.6; }
.info-row {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  font-size: 14px;
}
.info-row label {
  flex: 0 0 68px;
  color: #909399;
}
.info-row span {
  color: #303133;
}
.info-row.col {
  flex-direction: column;
  gap: 6px;
}
/* 竖排时标签不要占 68px 高（那是横排时的宽度），不然「需求内容」和正文之间空一大截 */
.info-row.col label { flex: none; }
/* 底部按钮：图标和字之间留点空 */
.detail-footer .el-icon { margin-right: 6px; }
.info-row.col p {
  margin: 0;
  color: #303133;
  line-height: 1.6;
  white-space: pre-wrap;
}
.mats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.detail-page .bug-section {position:static;max-width:960px;margin:0 auto;background:none;border:0;box-shadow:none;padding:0}
.bug-head,.issue-heading,.bug-actions,.all-issues,.bug-summary {display:flex;align-items:center;gap:8px}
.bug-head {justify-content:space-between;margin:2px 0 12px}
.all-issues,.bug-summary {border:0;background:transparent;font:inherit;text-align:left;padding:6px 0;cursor:pointer;color:#365478}
.bug-summary strong {font-size:16px;color:#243851}.bug-summary span,.bug-summary .el-icon {font-size:12px}
.bug-panel {position:static;overflow:visible;max-height:none}.bug-list {display:grid;gap:12px}
.issue-filters {display:grid;gap:4px;margin-bottom:12px;padding:8px 12px;background:white;border:1px solid #dce5f0;border-radius:12px}
.filter-row {display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.filter-row>span {margin-right:4px;font-size:12px;color:#5a6e87}
.filter-row button,.clear-filters {min-height:34px;padding:5px 9px;background:transparent;border:0;border-radius:7px;color:#465c77;font:inherit;font-size:13px;cursor:pointer}
.filter-row button:hover,.clear-filters {background:#f0f5ff;color:#2158b1}
.filter-row button[aria-pressed=true] {background:#e8f0ff;color:#164da9;font-weight:650}
.filter-row button:focus-visible,.clear-filters:focus-visible {outline:2px solid #3976dc;outline-offset:1px}
.clear-filters {margin-inline:4px}
.bug-meta time {font-variant-numeric:tabular-nums}
.detail-page .bug-item {display:block;background:white;padding:clamp(16px,2vw,24px);margin:0;border:1px solid #d8e3ef;border-radius:14px;box-shadow:0 5px 18px #22395608}
.issue-heading {justify-content:space-between}.issue-heading strong {color:#526b87;font-size:13px;letter-spacing:.01em}
.bug-body {min-width:0}.detail-page .bug-body .issue-description {font-size:17px;color:#1d314d;line-height:1.7;margin:12px 0;font-weight:550;white-space:pre-wrap;overflow-wrap:anywhere}
.detail-page .bug-meta,.update-meta {font-size:12px;color:#61748a;line-height:1.6}.bug-meta {margin:8px 0}.bug-meta span {padding:0 6px}
.bug-updates {border-top:1px solid #e6ecf3;margin-top:16px;padding-top:14px}
.bug-updates h3 {font-size:14px;margin:0 0 10px;color:#334962}.bug-updates h3 small {font-size:12px;color:#697a91}
.bug-update {padding:4px 0 6px 12px;border-left:2px solid #d1e1f6;margin:8px 0}
.bug-update p {font-size:15px;color:#2a405b;line-height:1.65;margin:3px 0;overflow-wrap:anywhere;white-space:pre-wrap}
.issue-more {margin-left:auto}.update-meta strong {margin-right:7px;color:#2c5f9e;font-weight:650}
.detail-page .bug-update.target-reply {background:#e9f2ff;outline:2px solid #87adf3;outline-offset:3px;border-radius:5px}
.bug-actions {flex-wrap:wrap;border-top:1px solid #e6ecf3;margin-top:15px;padding-top:12px;gap:5px}
.bug-actions :deep(.el-button) {margin:0;min-height:34px}.bug-actions :deep(.el-button--danger) {margin-left:auto}
.bug-upload {margin:10px 0}.bug-update-form {background:#f4f7fb;border-radius:9px;margin-top:12px;padding:10px}.bug-update-form>.el-button {width:100%}
.empty-bugs {text-align:center;padding:26px 12px;background:#fff;color:#5a6e87;border:1px solid #dde6ef;border-radius:12px}
.bug-panel-enter-active,.bug-panel-leave-active {transition:opacity .14s ease}.bug-panel-enter-from,.bug-panel-leave-to {opacity:0}
.chat-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 18px 4px 4px;
}
.chat-title span {
  font-weight: 600;
  color: #303133;
}
.chat {
  padding: 4px 2px;
}
.empty-chat {
  text-align: center;
  color: #a8abb2;
  font-size: 13px;
  padding: 30px 0;
}
@media (min-width: 769px) {
  .detail-page { max-width: 1280px; margin: 0 auto; padding: 24px clamp(18px, 3vw, 48px); }
  .detail-page .topbar { border-radius: 14px 14px 0 0; }
  .customer-project-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; padding: 16px 22px; background: white; }
  .summary-progress { flex-basis: 100%; }
  .customer-project-summary .info-row { margin: 0; padding: 3px 0; }
  /* 电脑上：验收提示单独占一行；「截止日期：」这些标签不折行（以前被挤成两行） */
  .customer-project-summary .accept-hint { flex-basis: 100%; margin: 0; }
  .customer-project-summary .info-row label { flex: none; white-space: nowrap; }
  .detail-tabs { display: flex; gap: 6px; padding: 0 18px; background: white; border-bottom: 1px solid #e2e9f3; }
  .detail-tabs button { padding: 12px 18px; border: 0; border-bottom: 2px solid transparent; background: none; color: #61728a; font: inherit; cursor: pointer; }
  .detail-tabs button.active { color: #165dff; border-bottom-color: currentColor; }
  .detail-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; background: white; border-top: 1px solid #e2e9f3; }
  /* 电脑上按钮靠右、正常大小，不拉成两条横贯整页的长条 */
  .detail-footer .el-button { flex: none; min-width: 132px; }
  .detail-page .scroll { min-height: 0; }
}
.detail-page .bug-item {padding:0;border-radius:16px;box-shadow:0 6px 22px #16365c0a}
.issue-original,.detail-page .bug-updates,.detail-page .bug-update-form {min-width:0}
.issue-original {padding:clamp(17px,2.2vw,28px)}
.issue-heading strong {display:inline-flex;align-items:center;gap:7px;color:#38567c;font-variant-numeric:tabular-nums}
.issue-heading strong .el-icon {background:#eaf1ff;color:#2b5ba8;box-sizing:content-box;padding:6px;border-radius:7px;font-size:15px}
.detail-page .bug-body .issue-description {font-size:clamp(17px,1.45vw,21px);line-height:1.7;margin:16px 0 9px}
.detail-page .bug-body .bug-meta {margin:9px 0 0;overflow-wrap:anywhere}
.detail-page .bug-updates {background:#f6f8fc;margin:0;padding:19px clamp(17px,2.1vw,26px);border-top:1px solid #e1e8f2}
.bug-updates h3 {display:flex;align-items:center;gap:6px;margin:0 0 13px}
.bug-updates h3 small {background:#e6edf8;border-radius:20px;color:#466387;font-size:11px;line-height:18px;min-width:19px;text-align:center}
.detail-page .bug-update {position:relative;margin:0 0 0 4px;padding:1px 0 13px 15px;border-left:1px solid #cbd9ed}
.detail-page .bug-update:last-child {padding-bottom:3px}.detail-page .bug-update::before {content:"";position:absolute;left:-4px;top:7px;width:7px;height:7px;border-radius:50%;background:#537dbe;box-shadow:0 0 0 3px #f6f8fc}
.detail-page .bug-update-form {margin:12px 16px 16px;padding:14px}
.detail-page .bug-actions {margin:0;padding:9px clamp(12px,1.75vw,22px);background:#fbfcff;border-top:1px solid #e1e8f2;border-radius:0 0 16px 16px}
.detail-page .bug-actions :deep(.el-button.is-plain) {border-radius:8px;border-color:#bfd2ee;color:#294f82}
.stale-review {padding:12px 16px;background:#f5f8fc;color:#405773;font-size:14px}
.stale-review button {margin-left:6px;padding:6px;border:0;background:transparent;color:#2459bc;font:inherit;cursor:pointer}
@media(min-width:1050px){
  .bug-body.split-record {display:grid;grid-template-columns:minmax(0,1.25fr) minmax(225px,.8fr)}
  .split-record>.issue-original {grid-column:1}.detail-page .split-record>.bug-updates {grid-column:2;border-radius:0 16px 0 0;border:0;border-left:1px solid #e1e8f2}
  .split-record>.bug-update-form {grid-column:1/-1}
}

</style>

<style>
.el-dialog.customer-issue-dialog {
  width: min(580px, calc(100% - 24px));
  min-height: 0;
  box-sizing: border-box;
  max-height: calc(100dvh - 24px);
  margin: auto;
  display: flex;
  flex-direction: column;
}
.customer-issue-dialog .el-dialog__body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
@media (max-width: 768px) {
  .el-dialog.customer-issue-dialog { width: 100%; height: 100dvh; max-height: 100dvh; }
}
.customer-issue-dialog .el-dialog__footer { flex: none; }
</style>
