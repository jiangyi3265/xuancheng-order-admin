<template>
  <el-drawer
    :model-value="visible"
    :title="order ? order.title : '订单详情'"
    size="480px"
    @update:model-value="(v) => emit('update:visible', v)"
    @open="onOpen"
  >
    <div v-if="order" class="detail">
      <!-- 头部标签 -->
      <div class="tags">
        <el-tag size="small" :type="statusMap[order.status]?.type">{{ statusMap[order.status]?.label }}</el-tag>
        <el-tag size="small" effect="plain" :style="{ color: channelMap[order.channel]?.color, borderColor: channelMap[order.channel]?.color }">
          {{ channelMap[order.channel]?.label }}
        </el-tag>
        <span class="no">{{ order.orderNo }}</span>
      </div>

      <!-- 基本信息 -->
      <el-descriptions :column="1" border size="small" class="desc">
        <el-descriptions-item label="客户">{{ order.customer || '-' }}</el-descriptions-item>
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

      <!-- 需求材料（图片 / 视频 / 文件） -->
      <div v-if="order.attachments && order.attachments.length" class="gallery">
        <div class="gallery-label"><el-icon><Paperclip /></el-icon> 需求材料（{{ order.attachments.length }}）</div>
        <AttachmentView :items="order.attachments" :size="84" />
      </div>

      <!-- 一键下一步 + 改状态 -->
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
        <el-button size="small" :icon="EditPen" @click="doRevision">改稿 +1</el-button>
        <el-button size="small" :icon="Bell" @click="doNudge">催一下</el-button>
      </div>

      <!-- 进度时间线 -->
      <div class="timeline-title">进度 / 沟通记录</div>
      <div class="add-progress">
        <el-input v-model="note" size="small" type="textarea" :rows="2" placeholder="记一笔：转达需求、改稿、卡点、完成截图…" />
        <AttachmentUploader v-model="noteFiles" :limit="3" class="note-upload" />
        <el-button type="primary" size="small" :icon="Promotion" @click="addNote">记录</el-button>
      </div>

      <el-timeline class="timeline">
        <el-timeline-item
          v-for="(t, i) in order.timeline"
          :key="i"
          :timestamp="t.time"
          :color="dotColor(t.type)"
          placement="top"
        >
          <div><span class="t-user">{{ t.user }}</span> {{ t.content }}</div>
          <div v-if="t.attachments && t.attachments.length" class="t-imgs">
            <AttachmentView :items="t.attachments" :size="64" />
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>

    <template #footer>
      <el-button :icon="Edit" @click="emit('edit', order)">编辑</el-button>
      <el-button type="danger" :icon="Delete" @click="emit('delete', order)">删除</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Edit, Delete, Paperclip, Promotion, EditPen, Bell } from '@element-plus/icons-vue'
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
const emit = defineEmits(['update:visible', 'edit', 'delete'])

const note = ref('')
const noteFiles = ref([])
const statusModel = ref('')

watch(
  () => props.order,
  (o) => {
    statusModel.value = o?.status || ''
  },
  { immediate: true }
)

function onOpen() {
  // 打开即标记当前角色已读 —— 红点消除
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
function addNote() {
  if (!note.value.trim() && !noteFiles.value.length) return
  addProgress(props.order.id, note.value.trim(), 'note', [...noteFiles.value])
  note.value = ''
  noteFiles.value = []
}
function dotColor(type) {
  return { create: '#909399', status: '#409eff', note: '#67c23a' }[type] || '#909399'
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
.gallery-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.g-img {
  width: 84px;
  height: 84px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  cursor: pointer;
}
.status-bar {
  display: flex;
  align-items: center;
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
.timeline-title {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid #409eff;
}
.add-progress {
  margin-bottom: 18px;
}
.note-upload {
  margin: 8px 0;
}
.add-progress .el-button {
  width: 100%;
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
.t-img {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
  cursor: pointer;
}
</style>
