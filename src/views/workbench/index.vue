<template>
  <div class="workbench">
    <!-- 一句话：现在要我做什么 -->
    <div class="hello">
      <el-avatar :size="36" :style="{ background: currentMember.color }">
        {{ currentMember.name.slice(-1) }}
      </el-avatar>
      <div class="hello-text">
        <div class="hi">
          <b class="red">{{ todoList.length }}</b> 件等你处理，
          <b>{{ waitingList.length }}</b> 件在等{{ isBoss ? '员工' : '老板' }}
        </div>
      </div>
      <el-button :icon="Refresh" text @click="$forceUpdate()" style="margin-left: auto" />
    </div>

    <!-- 老板：员工提交的申请，批了才生效 -->
    <template v-if="isBoss && pendingApprovals.length">
      <div class="section-title amber-bar">
        <span><span class="ico">📝</span> 待我批准</span>
        <el-tag type="warning" effect="dark" round size="small">{{ pendingApprovals.length }}</el-tag>
      </div>
      <div class="approval-list">
        <ApprovalItem v-for="a in pendingApprovals" :key="a.id" :a="a" />
      </div>
    </template>

    <!-- 员工：自己提交过的申请，老板批了才生效 -->
    <template v-if="!isBoss && myRequests.length">
      <div class="section-title gray-bar">
        <span><span class="ico">📝</span> 我的申请</span>
        <span class="team-tip">老板批准了才生效</span>
      </div>
      <div class="approval-list">
        <ApprovalItem v-for="a in myRequests" :key="a.id" :a="a" />
      </div>
    </template>

    <!-- 老板：每个人手上有多少单，点进去只看这个人的 -->
    <template v-if="isBoss && team.length > 1">
      <div class="section-title blue-bar">
        <span><span class="ico">👥</span> 我的团队</span>
        <span class="team-tip">点一个人，只看 TA 手上的单子</span>
      </div>
      <div class="team">
        <div
          v-for="t in team"
          :key="t.m.id"
          class="member-card"
          :class="{ off: t.m.status !== '0' }"
          @click="goMember(t.m)"
        >
          <el-avatar :size="40" :style="{ background: t.m.color }">{{ t.m.name.slice(-1) }}</el-avatar>
          <div class="mc-body">
            <div class="mc-name">
              {{ t.m.id === currentMember.id ? '我自己' : t.m.name }}
              <span v-if="t.m.status !== '0'" class="mc-role off-tag">已停用</span>
            </div>
            <div class="mc-line">{{ memberLine(t) }}</div>
          </div>
        </div>
      </div>
    </template>

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
          <!-- 按钮一行、状态和期限一行（电脑上这两层不占位，和原来一样排成一行） -->
          <div class="rc-actions">
            <template v-if="!isBoss && o.assignState === 'pending'">
              <el-button size="small" type="primary" :loading="accepting === o.id" @click.stop="doAccept(o)">接收</el-button>
              <el-button size="small" @click.stop="openReject(o)">拒绝…</el-button>
            </template>
            <el-button
              v-if="naOf(o)"
              size="small"
              type="primary"
              :icon="Promotion"
              @click.stop="quickNext(o)"
            >{{ naOf(o).label }}</el-button>
            <AssignMenu :order="o" />
          </div>
          <div class="rc-info">
            <el-tag size="small" :type="statusMap[o.status]?.type" effect="light">{{ statusMap[o.status]?.label }}</el-tag>
            <el-tag v-if="dueTag(o)" :type="dueTag(o).type" size="small" effect="dark">{{ dueTag(o).text }}</el-tag>
            <span class="rc-deadline" :class="{ red: isOverdue(o) }">
              <el-icon><Clock /></el-icon>{{ o.deadline || '无期限' }}
            </span>
          </div>
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
          <div class="rc-actions">
            <el-button size="small" :icon="Bell" @click.stop="quickNudge(o)">催一下</el-button>
            <AssignMenu :order="o" />
          </div>
          <div class="rc-info">
            <el-tag v-if="dueTag(o)" :type="dueTag(o).type" size="small" effect="dark">{{ dueTag(o).text }}</el-tag>
            <span class="rc-deadline" :class="{ red: isOverdue(o) }">
              <el-icon><Clock /></el-icon>{{ o.deadline || '无期限' }}
            </span>
          </div>
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
    <ReasonDialog
      v-model:visible="rejectVisible"
      title="拒绝这个项目"
      :tip="rejecting ? `「${rejecting.title}」会回到老板名下，老板会看到你写的原因。` : ''"
      placeholder="写一下为什么不接，比如：这周排满了"
      confirm-text="拒绝"
      danger
      :submit="doReject"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Paperclip, Clock, Refresh, Promotion, Bell } from '@element-plus/icons-vue'
import OrderDetail from '@/views/order/components/OrderDetail.vue'
import OrderDialog from '@/views/order/components/OrderDialog.vue'
import NotebookDialog from '@/components/NotebookDialog.vue'
import AssignMenu from '@/components/AssignMenu.vue'
import ApprovalItem from '@/components/ApprovalItem.vue'
import ReasonDialog from '@/components/ReasonDialog.vue'
import { changeOrderStatus } from '@/utils/settle'
import { useRouter } from 'vue-router'
import {
  orders, approvals, pendingApprovals, getOrder, currentMember, isBoss, editOrder, removeOrder, nudge,
  acceptOrder, rejectOrder
} from '@/mock/store'
import { statusMap, MEMBERS, memberMap } from '@/constants/options'
import { isMyTodo, isWaitingOther, nextAction } from '@/utils/workbench'
import { todayStr as todayLocal } from '@/utils/date'

const router = useRouter()
const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr
const isUnread = (o) => o.unread?.includes(currentMember.value.id)

const todoList = computed(() => orders.filter((o) => isMyTodo(o, currentMember.value.id)))
const waitingList = computed(() => orders.filter((o) => isWaitingOther(o, currentMember.value.id)))

const ownerName = (o) => memberMap[o.ownerId]?.name || '负责人'
function reasonFor(o) {
  if (!isBoss.value && o.assignState === 'pending') return '老板派给你的新项目：先接收，再开工'
  if (isUnread(o)) return '对方有新动态，点开查看'
  if (isBoss.value && o.status === 'review') return `${ownerName(o)} 做完提交了，等你验收`
  if (isBoss.value && o.status === 'pending' && o.ownerId !== currentMember.value.id) {
    return `客户需求已录入，确认后让 ${ownerName(o)} 开工`
  }
  if (o.status === 'doing') return '进行中，记得推进并回报进度'
  return '待处理'
}
function waitReasonFor(o) {
  if (isBoss.value && o.assignState === 'pending') return `${ownerName(o)} 还没接收，等 TA 回复`
  if (isBoss.value) return `${ownerName(o)} 正在做，等 TA 交付`
  return '已提交，等老板验收'
}

// ---- 员工：接收 / 拒绝老板刚派来的项目 ----
const accepting = ref(null)
const rejectVisible = ref(false)
const rejecting = ref(null)
async function doAccept(o) {
  accepting.value = o.id
  try {
    await acceptOrder(o.id)
    ElMessage.success(`已接收「${o.title}」，可以开工了`)
  } catch (e) {
    ElMessage.error(e.message || '接收失败')
  } finally {
    accepting.value = null
  }
}
function openReject(o) {
  rejecting.value = o
  rejectVisible.value = true
}
async function doReject(reason) {
  await rejectOrder(rejecting.value.id, reason)
  ElMessage.success('已拒绝，项目回到老板名下')
}

// 员工自己提交过的申请（待批的排在前面），最多显示 6 条
const myRequests = computed(() => approvals.slice(0, 6))

// ---- 团队一览（老板）----
const liveOrders = computed(() => orders.filter((o) => !['done', 'cancelled'].includes(o.status)))

// 每个人手上的活（老板能看到全部，所以直接从订单里数）
const team = computed(() =>
  MEMBERS.map((m) => {
    const mine = liveOrders.value.filter((o) => o.ownerId === m.id)
    return {
      m,
      active: mine.length,
      review: mine.filter((o) => o.status === 'review').length,
      overdue: mine.filter((o) => o.deadline && o.deadline < todayStr).length
    }
  })
)
function memberLine(t) {
  if (!t.active) return '手上没有单子'
  const parts = [`手上 ${t.active} 单`]
  if (t.review) parts.push(`${t.review} 单等你验收`)
  if (t.overdue) parts.push(`${t.overdue} 单已逾期`)
  return parts.join('，')
}
function goMember(m) {
  router.push({ path: '/order', query: { owner: String(m.id) } })
}

const naOf = (o) => nextAction(o, currentMember.value.id)
async function quickNext(o) {
  const na = naOf(o)
  if (!na) return
  try {
    await changeOrderStatus(o, na.to)
    ElMessage.success(`「${o.title}」→ ${statusMap[na.to]?.label}`)
  } catch (e) {
    ElMessage.error(e.message || '修改状态失败')
  }
}
async function quickNudge(o) {
  try {
    await nudge(o.id)
    ElMessage.success(`已催办「${o.title}」，对方会收到提醒`)
  } catch (e) {
    ElMessage.error(e.message || '催办失败')
  }
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
.blue-bar {
  border-left-color: #409eff;
}
.amber-bar {
  border-left-color: #e6a23c;
}
.approval-list {
  display: grid;
  /* min(…, 100%)：窄屏上一列最多和容器一样宽，不会撑出屏幕；电脑上等于原来的 380px */
  grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
  gap: 12px;
}
.team-tip {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}
.team {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr));
  gap: 12px;
}
.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
}
.member-card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  transform: translateY(-1px);
}
.member-card.off {
  opacity: 0.6;
}
.mc-body {
  min-width: 0;
}
.mc-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.mc-role {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: #909399;
  background: #f4f4f5;
  border-radius: 4px;
  padding: 0 5px;
}
.mc-role.off-tag {
  color: #f56c6c;
  background: #fef0f0;
}
.mc-line {
  margin-top: 3px;
  font-size: 12px;
  color: #909399;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
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
/* 电脑上这两层只是分组，不生成盒子，里面的东西仍直接排在 .rc-meta 这一行里 */
.rc-actions,
.rc-info {
  display: contents;
}

/* 手机：卡片单列，按钮一行、状态和期限一行，按钮加大好点 */
@media (max-width: 768px) {
  .hello {
    gap: 10px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .hello-text {
    flex: 1;
    min-width: 0;
  }
  .hello .hi {
    font-size: 14px;
    line-height: 1.4;
  }
  .hello :deep(.el-button) {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    padding: 0;
  }
  .section-title {
    flex-wrap: wrap;
    gap: 4px 8px;
    margin: 14px 0 10px;
  }
  .team-tip {
    line-height: 1.4;
  }

  /* 团队：两人一排（一排放不下两个就一人一排） */
  .team {
    grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
    gap: 10px;
  }
  .member-card {
    min-width: 0;
    gap: 10px;
    padding: 10px;
  }
  .mc-body {
    flex: 1;
    overflow-wrap: anywhere;
  }
  .mc-line {
    line-height: 1.5;
  }

  .approval-list,
  .cards {
    gap: 10px;
  }
  .row-card {
    min-width: 0;
    padding: 12px;
  }
  .new-badge {
    right: -4px;
  }
  .rc-main {
    min-width: 0;
  }
  .rc-title,
  .rc-reason {
    overflow-wrap: anywhere;
  }
  .rc-title .pic {
    flex-shrink: 0;
  }
  .rc-meta {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-top: 10px;
  }
  .rc-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .rc-actions:empty {
    display: none;
  }
  /* 按钮：至少 36px 高；直接放在这一行的按钮平分剩余宽度 */
  .rc-actions :deep(.el-button) {
    height: auto;
    min-height: 36px;
    padding: 8px 14px;
    font-size: 14px;
  }
  .rc-actions > :deep(.el-button) {
    flex: 1 1 0;
  }
  .rc-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }
  .rc-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .rc-deadline {
    flex-shrink: 0;
    white-space: nowrap;
  }
}
/* 特别窄的手机：问候那句再小一点，尽量保持一行 */
@media (max-width: 340px) {
  .hello .hi {
    font-size: 13px;
  }
}
</style>
