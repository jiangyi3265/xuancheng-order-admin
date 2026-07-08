<template>
  <el-drawer
    :model-value="visible"
    :title="order ? order.title : '订单详情'"
    size="520px"
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <div v-if="order" class="detail">
      <div class="tags">
        <el-tag size="small" :type="statusMap[order.status]?.type">{{ statusMap[order.status]?.label }}</el-tag>
        <el-tag size="small" effect="plain" :style="{ color: channelMap[order.channel]?.color, borderColor: channelMap[order.channel]?.color }">
          {{ channelMap[order.channel]?.label }}
        </el-tag>
        <span class="no">{{ order.orderNo }}</span>
      </div>

      <el-descriptions :column="1" border size="small" class="desc">
        <el-descriptions-item label="客户">{{ order.customer || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户账号">
          <el-tag v-if="order.customerAccount" size="small" type="success" effect="plain">{{ order.customerAccount }}</el-tag>
          <span v-else class="muted">未绑定</span>
        </el-descriptions-item>
        <el-descriptions-item label="联系方式">{{ order.contact || '-' }}</el-descriptions-item>
        <el-descriptions-item label="负责人">
          {{ memberMap[order.ownerId]?.name }}（{{ memberMap[order.ownerId]?.roleLabel }}）
        </el-descriptions-item>
        <el-descriptions-item label="报价">¥{{ order.amount || 0 }}</el-descriptions-item>
        <el-descriptions-item label="优先级">{{ priorityMap[order.priority]?.label || '-' }}</el-descriptions-item>
        <el-descriptions-item label="改稿次数">
          {{ order.revisions || 0 }} 次
          <el-tag v-if="(order.revisions || 0) >= 3" type="danger" size="small" effect="plain" style="margin-left:6px">改稿较多</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="截止日期">
          <span :class="{ red: isOverdue }">{{ order.deadline || '-' }}</span>
          <el-tag v-if="isOverdue" type="danger" size="small" style="margin-left: 6px">已逾期</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="需求">{{ order.requirement || '-' }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="order.attachments && order.attachments.length" class="gallery">
        <div class="gallery-label"><el-icon><Paperclip /></el-icon> 需求材料（{{ order.attachments.length }}）</div>
        <AttachmentView :items="order.attachments" :size="84" />
      </div>

      <div class="status-bar">
        <el-button v-if="na" type="primary" :icon="Promotion" @click="doNext">
          {{ na.label }}
        </el-button>
        <span class="label">{{ na ? '或手动设为' : '更新状态' }}</span>
        <el-select v-model="statusModel" size="small" style="width: 120px" @change="onStatus">
          <el-option v-for="s in STATUS" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </div>

      <div class="action-row">
        <el-button size="small" type="warning" plain :icon="Notebook" @click="emit('notebook', order)">项目记事本</el-button>
        <el-button size="small" :icon="EditPen" @click="doRevision">改稿 +1</el-button>
        <el-button size="small" :icon="Bell" @click="doNudge">催一下</el-button>
      </div>

      <section class="section">
        <div class="section-head">
          <div>
            <h3>客户沟通</h3>
            <p>这里发送的消息客户能看到，总裁和副总裁也都能看到。</p>
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

      <section class="section">
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

    <template #footer>
      <el-button :icon="Edit" @click="emit('edit', order)">编辑</el-button>
      <el-button type="danger" :icon="Delete" @click="emit('delete', order)">删除</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Edit, Delete, Paperclip, Promotion, EditPen, Bell, Notebook } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import AttachmentView from '@/components/AttachmentView.vue'
import { setStatus, addProgress, markRead, addRevision, nudge, currentMember } from '@/mock/store'
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
const statusModel = ref('')

const chatTypes = ['message', 'reply']
const chatItems = computed(() => (props.order?.timeline || []).filter((t) => chatTypes.includes(t.type)))
const recordItems = computed(() => (props.order?.timeline || []).filter((t) => !chatTypes.includes(t.type)))

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
.tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.tags .no {
  margin-left: auto;
  color: #c0c4cc;
  font-size: 12px;
}
.desc {
  margin-bottom: 14px;
}
.red {
  color: #f56c6c;
  font-weight: 600;
}
.gallery {
  margin-bottom: 16px;
}
.gallery-label {
  font-size: 13px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.status-bar .label {
  font-size: 14px;
  color: #606266;
}
.action-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.section {
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
  margin-top: 18px;
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
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
.chat-list {
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
.add-progress {
  margin-bottom: 12px;
}
.note-upload {
  margin: 8px 0;
}
.composer .el-button,
.add-progress .el-button {
  width: 100%;
}
.t-user {
  font-weight: 600;
  color: #409eff;
  margin-right: 4px;
}
.muted {
  color: #c0c4cc;
}
.t-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
</style>
