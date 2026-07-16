<template>
  <div class="workbench">
    <!-- 角色问候 -->
    <div class="hello">
      <el-avatar :size="40" :style="{ background: currentMember.color }">
        {{ currentMember.name.slice(-1) }}
      </el-avatar>
      <div class="hello-text">
        <div class="hi">{{ currentMember.roleLabel }}视角 · {{ currentMember.name }}</div>
        <div class="sub">
          你有 <b class="red">{{ todoList.length }}</b> 个待处理，
          <b>{{ waitingList.length }}</b> 个在等对方
        </div>
      </div>
      <el-button :icon="Refresh" text @click="$forceUpdate()" style="margin-left: auto" />
    </div>

    <!-- 需要我处理 -->
    <div class="section-title red-bar">
      <span><span class="ico">🔴</span> 需要我处理</span>
      <el-tag type="danger" effect="dark" round size="small">{{ todoList.length }}</el-tag>
    </div>
    <div v-if="todoList.length" class="cards">
      <div v-for="o in todoList" :key="o.id" class="row-card todo" @click="openDetail(o)">
        <span v-if="isUnread(o)" class="new-badge">NEW</span>
        <div class="rc-main">
          <div class="rc-title">
            {{ o.title }}
            <el-icon v-if="o.attachmentCount || (o.attachments && o.attachments.length)" class="pic"><Paperclip /></el-icon>
          </div>
          <div class="rc-reason">{{ reasonFor(o) }}</div>
        </div>
        <div class="rc-meta">
          <el-button
            v-if="naOf(o)"
            size="small"
            type="primary"
            :icon="Promotion"
            @click.stop="quickNext(o)"
          >{{ naOf(o).label }}</el-button>
          <el-tag size="small" :type="statusMap[o.status]?.type" effect="light">{{ statusMap[o.status]?.label }}</el-tag>
          <el-tag v-if="dueTag(o)" :type="dueTag(o).type" size="small" effect="dark">{{ dueTag(o).text }}</el-tag>
          <span class="rc-deadline" :class="{ red: isOverdue(o) }">
            <el-icon><Clock /></el-icon>{{ o.deadline || '无期限' }}
          </span>
        </div>
      </div>
    </div>
    <el-empty v-else description="待办都清空啦，很棒 🎉" :image-size="80" />

    <!-- 等对方处理 -->
    <div class="section-title gray-bar">
      <span><span class="ico">⏳</span> 等对方处理</span>
      <el-tag type="info" effect="plain" round size="small">{{ waitingList.length }}</el-tag>
    </div>
    <div v-if="waitingList.length" class="cards">
      <div v-for="o in waitingList" :key="o.id" class="row-card waiting" @click="openDetail(o)">
        <div class="rc-main">
          <div class="rc-title">{{ o.title }}</div>
          <div class="rc-reason gray">{{ waitReasonFor(o) }}</div>
        </div>
        <div class="rc-meta">
          <el-button size="small" :icon="Bell" @click.stop="quickNudge(o)">催一下</el-button>
          <el-tag v-if="dueTag(o)" :type="dueTag(o).type" size="small" effect="dark">{{ dueTag(o).text }}</el-tag>
          <span class="rc-deadline" :class="{ red: isOverdue(o) }">
            <el-icon><Clock /></el-icon>{{ o.deadline || '无期限' }}
          </span>
        </div>
      </div>
    </div>
    <el-empty v-else description="没有在等对方的单子" :image-size="80" />

    <OrderDetail
      v-model:visible="detailVisible"
      :order="active"
      :loading="detailLoading"
      @edit="openDialog"
      @delete="handleDelete"
      @notebook="openNotebook"
    />
    <NotebookDialog v-model:visible="notebookVisible" :order="notebookOrder" />
    <OrderDialog v-model:visible="dialogVisible" :data="editing" @save="handleSave" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Paperclip, Clock, Refresh, Promotion, Bell } from '@element-plus/icons-vue'
import OrderDetail from '@/views/order/components/OrderDetail.vue'
import OrderDialog from '@/views/order/components/OrderDialog.vue'
import NotebookDialog from '@/components/NotebookDialog.vue'
import { orders, getOrder, currentMember, editOrder, removeOrder, setStatus, nudge } from '@/mock/store'
import { statusMap, BOSS_ID } from '@/constants/options'
import { isMyTodo, isWaitingOther, nextAction } from '@/utils/workbench'
import { todayStr as todayLocal } from '@/utils/date'

const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr
const isUnread = (o) => o.unread?.includes(currentMember.value.id)

const todoList = computed(() => orders.filter((o) => isMyTodo(o, currentMember.value.id)))
const waitingList = computed(() => orders.filter((o) => isWaitingOther(o, currentMember.value.id)))

function reasonFor(o) {
  if (isUnread(o)) return '对方有新动态，点开查看'
  if (currentMember.value.id === BOSS_ID) {
    if (o.status === 'review') return '副总裁已提交，待你验收'
    if (o.status === 'pending') return '客户需求已录入，待确认 / 派给副总裁'
  } else {
    if (o.status === 'doing') return '进行中，记得推进并回报进度'
  }
  return '待处理'
}
function waitReasonFor(o) {
  if (currentMember.value.id === BOSS_ID) return '副总裁进行中，等交付'
  return '已提交，等总裁验收'
}

const naOf = (o) => nextAction(o, currentMember.value.id)
function quickNext(o) {
  const na = naOf(o)
  if (!na) return
  setStatus(o.id, na.to)
  ElMessage.success(`「${o.title}」→ ${statusMap[na.to]?.label}`)
}
function quickNudge(o) {
  nudge(o.id)
  ElMessage.success(`已催办「${o.title}」，对方会收到提醒`)
}

// 到期/逾期标签
function dueTag(o) {
  if (!o.deadline || ['done', 'cancelled'].includes(o.status)) return null
  if (o.deadline < todayStr) return { text: '已逾期', type: 'danger' }
  if (o.deadline === todayStr) return { text: '今天到期', type: 'warning' }
  return null
}

const detailVisible = ref(false)
const detailLoading = ref(false)
const active = ref(null)
const dialogVisible = ref(false)
const editing = ref(null)
const notebookVisible = ref(false)
const notebookOrder = ref(null)

function openNotebook(row) {
  notebookOrder.value = row
  notebookVisible.value = true
}

async function openDetail(o) {
  active.value = o
  detailVisible.value = true
  detailLoading.value = true
  try {
    active.value = await getOrder(o.id)
  } catch (e) {
    ElMessage.error('加载项目失败：' + e.message)
  } finally {
    detailLoading.value = false
  }
}
async function openDialog(row) {
  try {
    editing.value = row?.id ? { ...(await getOrder(row.id)) } : null
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error('加载项目失败：' + e.message)
  }
}
async function handleSave(data) {
  try {
    if (data.id) {
      await editOrder(data)
      ElMessage.success('已更新')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}
function handleDelete(row) {
  ElMessageBox.confirm(`确定删除「${row.title}」吗？`, '提示', { type: 'warning' })
    .then(() => {
      removeOrder(row.id)
      detailVisible.value = false
      ElMessage.success('已删除')
    })
    .catch(() => {})
}
</script>

<style scoped>
.hello {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.hello .hi {
  font-size: 16px;
  font-weight: 600;
}
.hello .sub {
  font-size: 13px;
  color: #909399;
  margin-top: 2px;
}
.red {
  color: #f56c6c;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  margin: 18px 0 12px;
  padding-left: 10px;
  border-left: 3px solid #dcdfe6;
}
.section-title .ico {
  margin-right: 4px;
}
.red-bar {
  border-left-color: #f56c6c;
}
.gray-bar {
  border-left-color: #c0c4cc;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.row-card {
  position: relative;
  background: #fff;
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
  border-left: 3px solid transparent;
}
.row-card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  transform: translateY(-1px);
}
.row-card.todo {
  border-left-color: #f56c6c;
}
.row-card.waiting {
  border-left-color: #c0c4cc;
  opacity: 0.92;
}
.new-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #f56c6c;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
}
.rc-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 4px;
}
.rc-title .pic {
  color: #409eff;
}
.rc-reason {
  font-size: 13px;
  color: #f56c6c;
  margin-top: 4px;
}
.rc-reason.gray {
  color: #909399;
}
.rc-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}
.rc-deadline {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
}
.rc-deadline.red {
  color: #f56c6c;
  font-weight: 600;
}
</style>
