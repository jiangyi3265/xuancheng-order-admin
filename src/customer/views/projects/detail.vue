<template>
  <div class="detail-page">
    <header class="topbar">
      <el-icon class="back" :size="20" @click="router.push('/projects')"><ArrowLeft /></el-icon>
      <div class="tt">
        <strong>{{ order?.title || '项目详情' }}</strong>
        <span v-if="order">{{ subtitle }}</span>
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
      <el-button v-if="order && order.status === 'pending'" text type="danger" @click="removeOrder">撤回</el-button>
    </header>

    <section v-if="order && detailTab==='overview'" class="customer-project-summary">
      <ProgressSteps :status="order.status" :deadline="order.deadline" class="summary-progress" />
      <p v-if="order.status === 'review'" class="accept-hint" role="status">团队已经交付，请检查一下。没问题点「确认验收」，有不满意的地方点「还有问题」。</p>
      <div class="info-row summary-price"><label><el-icon><PriceTag/></el-icon> 报价：</label><span v-if="Number(order.amount)">¥{{ Number(order.amount).toLocaleString() }}</span><span v-else class="summary-unpriced">待报价</span></div>
      <div class="info-row"><label><el-icon><Calendar/></el-icon> 截止日期：</label><span>{{ order.deadline || '未设置' }}</span></div>
      <div class="info-row"><label><el-icon><User/></el-icon> 负责团队：</label><span>{{ TEAM_NAME }}</span></div>
    </section>
    <nav v-if="order" class="detail-tabs" aria-label="项目详情分区"><button v-for="t in detailTabs" :key="t.key" :class="{active:detailTab===t.key}" @click="detailTab=t.key">{{ t.label }}<i v-if="t.key==='chat' && chatHasNew" class="tab-new-dot" aria-hidden="true" title="团队有新回复"></i></button></nav>
    <main ref="scroller" class="scroll">
      <div v-if="loading" class="state"><el-icon class="loading"><Loading /></el-icon> 加载中...</div>

      <div v-else-if="loadError && !order" class="state error-state">
        <strong>项目暂时没有打开</strong>
        <span>{{ loadError }}</span>
        <div>
          <el-button :icon="ArrowLeft" @click="router.push('/projects')">返回项目</el-button>
          <el-button type="primary" :icon="Refresh" @click="load(true)">重新加载</el-button>
        </div>
      </div>

      <template v-else-if="order">
        <section v-show="detailTab==='bugs'" class="bug-section" :class="{ 'is-open': bugPanelOpen }">
          <div class="bug-head">
            <button type="button" class="bug-summary" @click="toggleBugPanel">
              <strong>问题跟踪</strong>
              <span>{{ bugItems.length }} 条</span>
            </button>
            <div class="bug-head-actions">
              <el-button size="small" type="primary" plain :icon="CirclePlus" @click="openBugCreate">
                反馈问题
              </el-button>
              <el-button
                size="small"
                text
                type="primary"
                :icon="bugPanelOpen ? ArrowUp : ArrowDown"
                @click="toggleBugPanel"
              >
                {{ bugPanelOpen ? '收起' : '展开' }}
              </el-button>
            </div>
          </div>

          <transition name="bug-panel">
            <div v-if="bugPanelOpen" class="bug-panel thin-scroll">
              <div class="bug-list">
                <div v-for="bug in bugItems" :key="bug.id" class="bug-item" :class="{ 'is-resolved': isBugResolved(bug) }">
                  <div class="bug-body">
                    <p>{{ bug.content || '只有附件' }}</p>
                    <AttachmentView v-if="bug.attachments && bug.attachments.length" :items="bug.attachments" :size="72" />
                    <div class="bug-meta">{{ bug.createdBy || '客户' }} · {{ bug.time }}</div>

                    <div v-if="bug.updates && bug.updates.length" class="bug-updates">
                      <div v-for="u in bug.updates" :key="u.id" class="bug-update">
                        <div class="update-meta">补充说明 · {{ u.createdBy || '客户' }} · {{ u.time }}</div>
                        <p>{{ u.content || '只有附件' }}</p>
                        <AttachmentView v-if="u.attachments && u.attachments.length" :items="u.attachments" :size="64" />
                      </div>
                    </div>

                    <div v-if="activeUpdateBugId === bug.id" class="bug-update-form" data-paste-zone="追加说明">
                      <el-input
                        v-model="updateText"
                        type="textarea"
                        :rows="2"
                        resize="none"
                        placeholder="补充新的说明或变更，可以粘贴截图"
                      />
                      <AttachmentUploader v-model="updateFiles" class="bug-upload" />
                      <el-button type="primary" :loading="updateSubmittingId === bug.id" @click="submitBugUpdate(bug)">
                        提交补充
                      </el-button>
                    </div>
                  </div>
                  <div class="bug-actions">
                    <el-radio-group
                      :key="statusUpdatingBugId === bug.id"
                      :model-value="bugStatus(bug)"
                      size="small"
                      class="bug-status"
                      :disabled="!!statusUpdatingBugId"
                      @change="(val) => changeBugStatus(bug, val)"
                    >
                      <el-radio-button value="open" :disabled="isBugResolved(bug) && ['done','cancelled'].includes(order.status)">{{ isBugResolved(bug) ? '重新激活' : '未解决' }}</el-radio-button>
                      <el-radio-button value="resolved">已解决</el-radio-button>
                    </el-radio-group>
                    <el-button text type="primary" :icon="CirclePlus" @click="toggleBugUpdate(bug)">
                      {{ activeUpdateBugId === bug.id ? '收起' : '补充说明' }}
                    </el-button>
                    <el-button
                      text
                      type="danger"
                      :icon="DeleteIcon"
                      :loading="deletingBugId === bug.id"
                      @click="removeBug(bug)"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
                <div v-if="!bugItems.length" class="empty-bugs">暂无问题</div>
              </div>
            </div>
          </transition>
        </section>

        <section v-show="detailTab==='overview'" class="info">
          <div class="info-row col"><label>需求内容</label><p>{{ order.requirement || '-' }}</p></div>
          <div v-if="order.attachments && order.attachments.length" class="info-row col">
            <label>需求材料</label>
            <div class="mats">
              <MediaThumb v-for="(m, i) in order.attachments" :key="i" :item="m" :size="76" />
            </div>
          </div>
        </section>

        <div v-show="detailTab==='chat'" class="chat-title">
          <span>沟通</span>
        </div>

        <div v-show="detailTab==='chat'" class="chat">
          <ChatMessage
            v-for="(t, i) in chatItems"
            :key="i"
            :item="t"
            :mine="t.type === 'message'"
          />
          <div v-if="!chatItems.length" class="empty-chat">
            还没有沟通消息，发一条给团队
          </div>
        </div>
      </template>
    </main>

    <div v-if="order && detailTab==='overview' && order.status === 'review'" class="detail-footer"><el-button @click="detailTab='bugs'; openBugCreate()"><el-icon><ChatDotRound/></el-icon>还有问题</el-button><el-button type="primary" :loading="accepting" @click="confirmAccept"><el-icon><CircleCheck/></el-icon>确认验收</el-button></div>
    <div v-else-if="order && detailTab==='overview'" class="detail-footer"><el-button @click="detailTab='chat'"><el-icon><Phone/></el-icon>联系负责人</el-button><el-button type="primary" @click="detailTab='bugs'; openBugCreate()"><el-icon><ChatDotRound/></el-icon>反馈问题</el-button></div>
    <el-dialog v-model="bugCreateOpen" title="反馈问题" append-to-body><section class="bug-associated"><small>关联项目</small><h3>{{ order?.title }}</h3></section><el-form label-position="top" data-paste-zone="反馈问题"><el-form-item label="问题说明"><el-input v-model="bugText" type="textarea" :rows="7" placeholder="请描述具体问题、出现位置及预期效果"/></el-form-item><el-form-item label="截图 / 相关文件"><AttachmentUploader v-model="bugFiles" class="bug-upload"/></el-form-item></el-form><p class="muted">提交后负责人会收到通知，你可以在问题列表查看处理进度。</p><template #footer><el-button @click="bugCreateOpen=false">取消</el-button><el-button type="primary" :loading="bugSubmitting" @click="submitBug">提交反馈</el-button></template></el-dialog>
    <MessageComposer v-if="order && detailTab==='chat'" :draft="draft" @send="onSend" />
  </div>
</template>

<script setup>
import { computed, ref, toRefs, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Loading, CirclePlus, Delete as DeleteIcon, ArrowDown, ArrowUp, Refresh } from '@element-plus/icons-vue'
import MediaThumb from '@/customer/components/MediaThumb.vue'
import AttachmentUploader from '@/customer/components/AttachmentUploader.vue'
import AttachmentView from '@/customer/components/AttachmentView.vue'
import ChatMessage from '@/customer/components/ChatMessage.vue'
import { chatDraft, sendDraft } from '@/utils/chatDraft'
import MessageComposer from '@/customer/components/MessageComposer.vue'
import ProgressSteps from '@/customer/components/ProgressSteps.vue'
import { markSeen, seenAt } from '@/customer/utils/seen'
import { getMyOrder, getMyOrderVersion, removeMyOrder, createBug, deleteBug, appendBugUpdate, updateBugStatus, sendMessage, acceptMyOrder } from '@/customer/mock/store'
import { statusMap, priorityMap, TEAM_NAME } from '@/customer/constants/options'

const route = useRoute()
const detailTab=ref(route.query.tab==='chat'?'chat':'overview')
const detailTabs=[{key:'overview',label:'需求'},{key:'chat',label:'沟通'},{key:'bugs',label:'问题'}]
const router = useRouter()
const id = route.params.id
const order = ref(null)
const loading = ref(true)
const loadError = ref('')
const syncState = ref('online')
const syncing = ref(false)
const draft = chatDraft('customer', id)
const { sending } = toRefs(draft)
const bugPanelOpen = ref(false)
const bugCreateOpen = ref(false)
const bugText = ref('')
const bugFiles = ref([])
const bugSubmitting = ref(false)
const deletingBugId = ref(null)
const statusUpdatingBugId = ref(null)
const activeUpdateBugId = ref(null)
const updateText = ref('')
const updateFiles = ref([])
const updateSubmittingId = ref(null)
const scroller = ref(null)
let poller = null

const chatItems = computed(() => (order.value?.timeline || []).filter((t) => t.type === 'message' || t.type === 'reply'))
// 团队有新回复：「沟通」上亮红点；打开沟通看过就记下，列表和消息页的红点一起灭
const lastChat = computed(() => chatItems.value[chatItems.value.length - 1])
const chatHasNew = computed(() => detailTab.value !== 'chat' && lastChat.value?.type === 'reply' && String(lastChat.value.time || '').replace('T', ' ').slice(0, 16) > seenAt(order.value?.id))
watch([detailTab, () => lastChat.value?.time], () => {
  if (detailTab.value === 'chat' && lastChat.value) markSeen(order.value?.id, lastChat.value.time)
}, { immediate: true })
const bugItems = computed(() => order.value?.bugs || [])
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
  return bug?.status === 'resolved' ? 'resolved' : 'open'
}

function isBugResolved(bug) {
  return bugStatus(bug) === 'resolved'
}

watch(detailTab, tab => { if(tab==='chat') scrollBottom(); else nextTick(()=>scroller.value?.scrollTo({top:0})) })

function scrollBottom(smooth = false, retry = 2) {
  if(detailTab.value!=='chat') return
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
    order.value = vo
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
  if (sending.value || bugSubmitting.value || deletingBugId.value || statusUpdatingBugId.value || updateSubmittingId.value) return
  syncing.value = true
  try {
    const version = await getMyOrderVersion(id)
    if (Number(version?.version || 0) !== Number(order.value.version || 0)) {
      const before = chatItems.value.length
      await load(false, true)
      if (chatItems.value.length > before) scrollBottom(true)
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
    if (vo) order.value = vo
    scrollBottom(true)
  } catch (e) {
    ElMessage.error(e.message || '发送失败')
  }
}

async function submitBug() {
  if (!bugText.value.trim() && !bugFiles.value.length) {
    ElMessage.warning('先写说明或粘贴截图')
    return
  }
  bugSubmitting.value = true
  try {
    const vo = await createBug(id, bugText.value.trim(), [...bugFiles.value])
    order.value = vo
    bugText.value = ''
    bugFiles.value = []
    bugPanelOpen.value = true
    bugCreateOpen.value = false
    ElMessage.success('问题已记下')
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    bugSubmitting.value = false
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
    order.value = vo
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
    order.value = vo
    ElMessage.success(status === 'resolved' ? '已标记已解决' : '已重新激活，等待处理')
  } catch (e) {
    ElMessage.error(e.message || '状态更新失败')
  } finally {
    statusUpdatingBugId.value = null
  }
}

function toggleBugUpdate(bug) {
  if (activeUpdateBugId.value === bug.id) {
    activeUpdateBugId.value = null
    updateText.value = ''
    updateFiles.value = []
    return
  }
  activeUpdateBugId.value = bug.id
  updateText.value = ''
  updateFiles.value = []
}

async function submitBugUpdate(bug) {
  if (!updateText.value.trim() && !updateFiles.value.length) {
    ElMessage.warning('先写追加说明或粘贴截图')
    return
  }
  updateSubmittingId.value = bug.id
  try {
    const vo = await appendBugUpdate(bug.id, updateText.value.trim(), [...updateFiles.value])
    order.value = vo
    updateText.value = ''
    updateFiles.value = []
    activeUpdateBugId.value = null
    ElMessage.success('已补充说明')
  } catch (e) {
    ElMessage.error(e.message || '补充失败')
  } finally {
    updateSubmittingId.value = null
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
})

onBeforeUnmount(() => {
  if (poller) clearInterval(poller)
  window.removeEventListener('focus', syncNow)
  document.removeEventListener('visibilitychange', syncNow)
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
.bug-section {
  position: sticky;
  top: 0;
  z-index: 20;
  margin-bottom: 10px;
}
.bug-section.is-open {
  z-index: 50;
}
.bug-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px 9px 12px;
  background: #fdfefe;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(31, 45, 61, 0.06);
}
.bug-summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.bug-summary strong {
  font-size: 16px;
  font-weight: 700;
  color: #303133;
}
.bug-summary span {
  flex: 0 0 auto;
  color: #a8abb2;
  font-size: 12px;
}
.bug-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.bug-head-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.bug-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  max-height: min(62vh, 520px);
  overflow-y: auto;
  padding: 12px;
  background: #fdfefe;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  box-shadow: 0 18px 40px rgba(31, 45, 61, 0.18);
}
.bug-panel-enter-active,
.bug-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.bug-panel-enter-from,
.bug-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.bug-form {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}
.bug-upload {
  margin: 10px 0;
}
.bug-form .el-button {
  width: 100%;
}
.bug-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bug-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: #f7f9fc;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.bug-item.is-resolved {
  background: #f6fbf7;
  border-color: #c8e6c9;
}
.bug-item.is-resolved .bug-body p {
  color: #606266;
}
.bug-body {
  flex: 1;
  min-width: 0;
}
.bug-body p {
  margin: 0 0 8px;
  color: #303133;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.bug-meta {
  margin-top: 8px;
  color: #a8abb2;
  font-size: 12px;
}
.bug-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: 0 0 auto;
}
.bug-status {
  margin-bottom: 2px;
}
.bug-status :deep(.el-radio-button__inner) {
  padding: 5px 9px;
  font-size: 12px;
}
.bug-updates {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #dcdfe6;
}
.bug-update {
  padding: 9px 10px;
  background: #fdfefe;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.bug-update p {
  margin: 4px 0 8px;
  color: #303133;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.update-meta {
  color: #909399;
  font-size: 12px;
}
.bug-update-form {
  margin-top: 10px;
  padding: 10px;
  background: #fdfefe;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
}
.bug-update-form .el-button {
  width: 100%;
}
.empty-bugs {
  text-align: center;
  color: #a8abb2;
  font-size: 13px;
  padding: 18px 0;
}
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
</style>
