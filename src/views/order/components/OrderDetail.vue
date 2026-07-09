<template>
  <el-drawer
    :model-value="visible"
    size="100%"
    direction="rtl"
    :with-header="false"
    class="order-workspace-drawer"
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <div v-if="order" class="workspace">
      <header class="workspace-head">
        <div class="title-block">
          <div class="title-line">
            <h2>{{ order.title }}</h2>
            <span class="order-no">{{ order.orderNo }}</span>
          </div>
          <div class="head-tags">
            <el-tag size="small" :type="statusMap[order.status]?.type">{{ statusMap[order.status]?.label }}</el-tag>
            <el-tag size="small" effect="plain" :style="{ color: channelMap[order.channel]?.color, borderColor: channelMap[order.channel]?.color }">
              {{ channelMap[order.channel]?.label }}
            </el-tag>
            <el-tag v-if="order.customerAccount" size="small" type="success" effect="plain">{{ order.customerAccount }}</el-tag>
            <el-tag v-if="isOverdue" size="small" type="danger">已逾期</el-tag>
          </div>
        </div>

        <div class="head-actions">
          <el-button v-if="na" type="primary" :icon="Promotion" @click="doNext">{{ na.label }}</el-button>
          <span class="inline-label">手动设为</span>
          <el-select v-model="statusModel" size="small" class="status-select" @change="onStatus">
            <el-option v-for="s in STATUS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
          <el-button size="small" type="warning" plain :icon="Notebook" @click="emit('notebook', order)">项目记事本</el-button>
          <el-button size="small" plain :icon="EditPen" @click="doRevision">改稿 +1</el-button>
          <el-button size="small" plain :icon="Bell" @click="doNudge">催一下</el-button>
          <el-button size="small" plain :icon="Edit" @click="emit('edit', order)">编辑</el-button>
          <el-button size="small" type="danger" plain :icon="Delete" @click="emit('delete', order)">删除</el-button>
          <el-button circle class="close-btn" :icon="Close" @click="emit('update:visible', false)" />
        </div>
      </header>

      <div class="workspace-body">
        <main class="left-pane">
          <section class="panel overview-panel">
            <div class="section-head compact">
              <div>
                <h3>订单信息</h3>
                <p>核心字段集中展示，处理时不用来回找。</p>
              </div>
            </div>

            <el-descriptions :column="3" border size="small" class="desc">
              <el-descriptions-item label="客户">{{ order.customer || '-' }}</el-descriptions-item>
              <el-descriptions-item label="联系方式">{{ order.contact || '-' }}</el-descriptions-item>
              <el-descriptions-item label="负责人">
                {{ memberMap[order.ownerId]?.name }}（{{ memberMap[order.ownerId]?.roleLabel }}）
              </el-descriptions-item>
              <el-descriptions-item label="报价">¥{{ order.amount || 0 }}</el-descriptions-item>
              <el-descriptions-item label="优先级">{{ priorityMap[order.priority]?.label || '-' }}</el-descriptions-item>
              <el-descriptions-item label="改稿次数">
                {{ order.revisions || 0 }} 次
                <el-tag v-if="(order.revisions || 0) >= 3" type="danger" size="small" effect="plain" class="inline-tag">改稿较多</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="截止日期">
                <span :class="{ red: isOverdue }">{{ order.deadline || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="需求" :span="2">
                <span class="requirement">{{ order.requirement || '-' }}</span>
              </el-descriptions-item>
            </el-descriptions>

            <div v-if="order.attachments && order.attachments.length" class="gallery">
              <div class="gallery-label"><el-icon><Paperclip /></el-icon> 需求材料（{{ order.attachments.length }}）</div>
              <AttachmentView :items="order.attachments" :size="76" />
            </div>
          </section>

          <div class="left-grid">
            <section class="panel bug-panel">
              <div class="section-head">
                <div>
                  <h3>Bug 清单</h3>
                  <p>客户问题和追加 QA 统一沉淀在这里。</p>
                </div>
                <el-button size="small" type="primary" plain :icon="CirclePlus" @click="bugOpen = !bugOpen">
                  {{ bugOpen ? '收起' : '快速创建 Bug' }}
                </el-button>
              </div>

              <div v-if="bugOpen" class="bug-form">
                <el-input
                  v-model="bugText"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  placeholder="写 Bug 说明，可以直接粘贴截图"
                />
                <AttachmentUploader v-model="bugFiles" :limit="6" class="note-upload" />
                <el-button type="primary" plain :icon="Promotion" :loading="bugSubmitting" @click="submitBug">创建 Bug</el-button>
              </div>

              <div class="bug-list">
                <div v-for="bug in bugItems" :key="bug.id" class="bug-item" :class="{ 'is-resolved': isBugResolved(bug) }">
                  <div class="bug-body">
                    <p>{{ bug.content || '只有附件' }}</p>
                    <AttachmentView v-if="bug.attachments && bug.attachments.length" :items="bug.attachments" :size="64" />
                    <div class="bug-meta">{{ bug.createdBy || '客户' }} · {{ bug.time }}</div>

                    <div v-if="bug.updates && bug.updates.length" class="bug-updates">
                      <div v-for="u in bug.updates" :key="u.id" class="bug-update">
                        <div class="update-meta">追加 QA · {{ u.createdBy || '客户' }} · {{ u.time }}</div>
                        <p>{{ u.content || '只有附件' }}</p>
                        <AttachmentView v-if="u.attachments && u.attachments.length" :items="u.attachments" :size="64" />
                      </div>
                    </div>

                    <div v-if="activeUpdateBugId === bug.id" class="bug-update-form">
                      <el-input
                        v-model="updateText"
                        type="textarea"
                        :rows="2"
                        resize="none"
                        placeholder="补充新的 QA / 变更说明，可以粘贴截图"
                      />
                      <AttachmentUploader v-model="updateFiles" :limit="6" class="note-upload" />
                      <el-button type="primary" plain :loading="updateSubmittingId === bug.id" @click="submitBugUpdate(bug)">
                        提交追加
                      </el-button>
                    </div>
                  </div>
                  <div class="bug-actions">
                    <el-radio-group
                      :model-value="bugStatus(bug)"
                      size="small"
                      class="bug-status"
                      :disabled="statusUpdatingBugId === bug.id"
                      @change="(val) => changeBugStatus(bug, val)"
                    >
                      <el-radio-button value="open">未解决</el-radio-button>
                      <el-radio-button value="resolved">已解决</el-radio-button>
                    </el-radio-group>
                    <el-button text type="primary" :icon="CirclePlus" @click="toggleBugUpdate(bug)">
                      {{ activeUpdateBugId === bug.id ? '收起' : '追加 QA' }}
                    </el-button>
                    <el-button
                      text
                      type="danger"
                      :icon="Delete"
                      :loading="deletingBugId === bug.id"
                      @click="removeBug(bug)"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
                <div v-if="!bugItems.length" class="empty">暂无 Bug</div>
              </div>
            </section>

            <section class="panel record-panel">
              <div class="section-head">
                <div>
                  <h3>内部记录</h3>
                  <p>只给总裁和副总裁看，不同步给客户。</p>
                </div>
                <el-tag size="small" type="info" effect="plain">{{ recordItems.length }} 条</el-tag>
              </div>

              <div class="add-progress">
                <el-input
                  v-model="note"
                  size="small"
                  type="textarea"
                  :rows="2"
                  resize="none"
                  placeholder="记录内部进度、改稿点、注意事项..."
                />
                <AttachmentUploader v-model="noteFiles" :limit="3" class="note-upload" />
                <el-button type="primary" plain size="small" :icon="Promotion" @click="addNote">记录</el-button>
              </div>

              <el-timeline class="timeline">
                <el-timeline-item
                  v-for="(t, i) in recordItems"
                  :key="i"
                  :timestamp="t.time"
                  :color="dotColor(t.type)"
                  placement="top"
                >
                  <div>
                    <span class="t-user">{{ t.user }}</span> {{ t.content }}
                  </div>
                  <div v-if="t.attachments && t.attachments.length" class="t-imgs">
                    <AttachmentView :items="t.attachments" :size="64" />
                  </div>
                </el-timeline-item>
              </el-timeline>
            </section>
          </div>
        </main>

        <aside class="right-pane">
          <section class="panel chat-panel">
            <div class="section-head">
              <div>
                <h3>客户沟通</h3>
                <p>这里发送的消息客户能看到，总裁和副总裁也能看到。</p>
              </div>
              <el-tag size="small" effect="plain">{{ chatItems.length }} 条</el-tag>
            </div>

            <div class="chat-list">
              <div v-for="(t, i) in chatItems" :key="i" class="chat-row" :class="{ team: t.type === 'reply' }">
                <div class="avatar">{{ avatarOf(t) }}</div>
                <div class="bubble-wrap">
                  <div class="meta">
                    <span>{{ t.type === 'reply' ? t.user : '客户 · ' + t.user }}</span>
                    <em>{{ t.time }}</em>
                  </div>
                  <div class="bubble">
                    <p v-if="t.content">{{ t.content }}</p>
                    <AttachmentView v-if="t.attachments && t.attachments.length" :items="t.attachments" :size="64" />
                  </div>
                </div>
              </div>
              <div v-if="!chatItems.length" class="empty">还没有客户沟通消息</div>
            </div>

            <div class="composer">
              <el-input
                v-model="replyText"
                type="textarea"
                :rows="2"
                resize="none"
                placeholder="回复客户，支持粘贴图片..."
              />
              <AttachmentUploader v-model="replyFiles" :limit="6" class="note-upload" />
              <el-button type="primary" :icon="Promotion" :loading="replying" @click="sendReply">发送给客户</el-button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Edit, Delete, Paperclip, Promotion, EditPen, Bell, Notebook, CirclePlus, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import AttachmentView from '@/components/AttachmentView.vue'
import { setStatus, addProgress, markRead, addRevision, nudge, createBug, deleteBug, appendBugUpdate, updateBugStatus, currentMember } from '@/mock/store'
import { STATUS, statusMap, channelMap, priorityMap, memberMap } from '@/constants/options'
import { nextAction } from '@/utils/workbench'
import { todayStr as todayLocal } from '@/utils/date'

const props = defineProps({
  visible: { type: Boolean, default: false },
  order: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'edit', 'delete', 'notebook'])

const note = ref('')
const noteFiles = ref([])
const replyText = ref('')
const replyFiles = ref([])
const replying = ref(false)
const bugOpen = ref(false)
const bugText = ref('')
const bugFiles = ref([])
const bugSubmitting = ref(false)
const deletingBugId = ref(null)
const statusUpdatingBugId = ref(null)
const activeUpdateBugId = ref(null)
const updateText = ref('')
const updateFiles = ref([])
const updateSubmittingId = ref(null)
const statusModel = ref('')

const chatTypes = ['message', 'reply']
const chatItems = computed(() => (props.order?.timeline || []).filter((t) => chatTypes.includes(t.type)))
const recordItems = computed(() => (props.order?.timeline || []).filter((t) => !chatTypes.includes(t.type)))
const bugItems = computed(() => props.order?.bugs || [])

function bugStatus(bug) {
  return bug?.status === 'resolved' ? 'resolved' : 'open'
}

function isBugResolved(bug) {
  return bugStatus(bug) === 'resolved'
}

watch(
  () => props.order,
  (o) => {
    statusModel.value = o?.status || ''
  },
  { immediate: true }
)

function onOpen() {
  if (props.order) markRead(props.order.id, currentMember.value.id)
}

const todayStr = todayLocal()
const isOverdue = computed(
  () =>
    props.order &&
    ['pending', 'doing', 'review'].includes(props.order.status) &&
    props.order.deadline &&
    props.order.deadline < todayStr
)

const na = computed(() => nextAction(props.order, currentMember.value.id))
function doNext() {
  if (na.value) setStatus(props.order.id, na.value.to)
}

function onStatus(val) {
  setStatus(props.order.id, val)
}
async function doRevision() {
  await addRevision(props.order.id)
  ElMessage.success('已记录改稿 +1')
}
async function doNudge() {
  await nudge(props.order.id)
  ElMessage.success('已催办，对方会收到提醒')
}
async function addNote() {
  if (!note.value.trim() && !noteFiles.value.length) return
  await addProgress(props.order.id, note.value.trim(), 'note', [...noteFiles.value])
  note.value = ''
  noteFiles.value = []
}
async function submitBug() {
  if (!bugText.value.trim() && !bugFiles.value.length) return
  bugSubmitting.value = true
  try {
    await createBug(props.order.id, bugText.value.trim(), [...bugFiles.value])
    bugText.value = ''
    bugFiles.value = []
    bugOpen.value = false
    ElMessage.success('Bug 已创建')
  } catch (e) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    bugSubmitting.value = false
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
  if (!updateText.value.trim() && !updateFiles.value.length) return
  updateSubmittingId.value = bug.id
  try {
    await appendBugUpdate(bug.id, updateText.value.trim(), [...updateFiles.value])
    updateText.value = ''
    updateFiles.value = []
    activeUpdateBugId.value = null
    ElMessage.success('已追加 QA')
  } catch (e) {
    ElMessage.error(e.message || '追加失败')
  } finally {
    updateSubmittingId.value = null
  }
}
async function removeBug(bug) {
  try {
    await ElMessageBox.confirm('删除后客户和后台都看不到这条 Bug，确定删除吗？', '删除 Bug', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
    deletingBugId.value = bug.id
    await deleteBug(bug.id)
    ElMessage.success('Bug 已删除')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  } finally {
    deletingBugId.value = null
  }
}
async function changeBugStatus(bug, status) {
  if (!bug || bugStatus(bug) === status) return
  statusUpdatingBugId.value = bug.id
  try {
    await updateBugStatus(bug.id, status)
    ElMessage.success(status === 'resolved' ? '已标记已解决' : '已标记未解决')
  } catch (e) {
    ElMessage.error(e.message || '状态更新失败')
  } finally {
    statusUpdatingBugId.value = null
  }
}
async function sendReply() {
  if (!replyText.value.trim() && !replyFiles.value.length) return
  replying.value = true
  try {
    await addProgress(props.order.id, replyText.value.trim(), 'reply', [...replyFiles.value])
    replyText.value = ''
    replyFiles.value = []
    ElMessage.success('已发送给客户')
  } catch (e) {
    ElMessage.error(e.message || '发送失败')
  } finally {
    replying.value = false
  }
}
function avatarOf(t) {
  return (t.user || (t.type === 'reply' ? currentMember.value.name : '客')).slice(0, 1)
}
function dotColor(type) {
  return { create: '#909399', status: '#409eff', note: '#67c23a', message: '#e6a23c', reply: '#409eff' }[type] || '#909399'
}
</script>

<style scoped>
:deep(.el-drawer__body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #f5f7fb;
}
:deep(.order-workspace-drawer) {
  background: #f5f7fb;
}
.workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: 0;
  color: #303133;
}
.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 24px;
  background: #fdfefe;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 8px rgba(31, 45, 61, 0.05);
  flex: 0 0 auto;
}
.title-block {
  min-width: 260px;
}
.title-line {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.title-line h2 {
  margin: 0;
  color: #1f2d3d;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
}
.order-no {
  color: #a8abb2;
  font-size: 13px;
}
.head-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.inline-label {
  color: #909399;
  font-size: 13px;
}
.status-select {
  width: 124px;
}
.close-btn {
  margin-left: 4px;
}
.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);
  gap: 16px;
  min-height: 0;
  padding: 16px;
  flex: 1;
}
.left-pane,
.right-pane {
  min-width: 0;
  min-height: 0;
}
.left-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding-right: 2px;
}
.right-pane {
  display: flex;
}
.panel {
  background: #fdfefe;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(31, 45, 61, 0.05);
}
.overview-panel {
  padding: 14px;
}
.left-grid {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
  gap: 16px;
  align-items: start;
}
.bug-panel,
.record-panel {
  padding: 14px;
}
.chat-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 14px;
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-head.compact {
  margin-bottom: 10px;
}
.section-head h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}
.section-head p {
  margin: 4px 0 0;
  color: #909399;
  font-size: 12px;
}
.desc {
  margin-bottom: 12px;
}
:deep(.desc .el-descriptions__label) {
  width: 96px;
  color: #606266;
  font-weight: 600;
}
:deep(.desc .el-descriptions__content) {
  color: #303133;
}
.requirement {
  white-space: pre-wrap;
  word-break: break-word;
}
.inline-tag {
  margin-left: 6px;
}
.red {
  color: #f56c6c;
  font-weight: 600;
}
.gallery {
  margin-top: 10px;
}
.gallery-label {
  font-size: 13px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}
.chat-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
}
.chat-row {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.chat-row.team {
  flex-direction: row-reverse;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: #fdfefe;
  background: #909399;
  font-weight: 600;
  flex: 0 0 auto;
}
.chat-row.team .avatar {
  background: #409eff;
}
.bubble-wrap {
  max-width: 78%;
}
.meta {
  display: flex;
  gap: 8px;
  color: #909399;
  font-size: 12px;
  margin-bottom: 4px;
}
.chat-row.team .meta {
  justify-content: flex-end;
}
.meta em {
  font-style: normal;
  color: #c0c4cc;
}
.bubble {
  background: #fdfefe;
  border-radius: 8px;
  padding: 9px 11px;
  color: #303133;
}
.chat-row.team .bubble {
  background: #ecf5ff;
}
.bubble p {
  margin: 0 0 6px;
  white-space: pre-wrap;
}
.empty {
  text-align: center;
  color: #a8abb2;
  font-size: 13px;
  padding: 18px 0;
}
.composer,
.bug-form,
.add-progress {
  margin-bottom: 12px;
}
.composer {
  flex: 0 0 auto;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
}
.bug-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
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
.note-upload {
  margin: 8px 0;
}
.composer .el-button,
.bug-form .el-button,
.add-progress .el-button {
  width: 100%;
}
.timeline {
  padding-left: 2px;
}
.t-user {
  font-weight: 600;
  color: #409eff;
  margin-right: 4px;
}
.t-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.muted {
  color: #c0c4cc;
}

@media (max-width: 1180px) {
  .workspace-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .head-actions {
    justify-content: flex-start;
  }
  .workspace-body {
    grid-template-columns: 1fr;
    overflow: auto;
  }
  .left-pane {
    overflow: visible;
  }
  .right-pane {
    min-height: 520px;
  }
}

@media (max-width: 860px) {
  .workspace-body {
    padding: 10px;
  }
  .left-grid {
    grid-template-columns: 1fr;
  }
  :deep(.desc .el-descriptions__body) {
    overflow-x: auto;
  }
}
</style>
