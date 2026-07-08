<template>
  <div class="order-page">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="left">
        <el-button type="primary" :icon="Plus" @click="openDialog()">快速接单</el-button>
        <el-radio-group v-model="viewMode" style="margin-left: 12px">
          <el-radio-button value="kanban">
            <el-icon><Grid /></el-icon> 看板
          </el-radio-button>
          <el-radio-button value="list">
            <el-icon><List /></el-icon> 列表
          </el-radio-button>
        </el-radio-group>
      </div>
      <div class="right">
        <el-input
          v-model="filter.keyword"
          placeholder="搜索项目名 / 客户"
          :prefix-icon="Search"
          clearable
          style="width: 200px"
        />
        <el-select v-model="filter.channel" placeholder="渠道" clearable style="width: 110px">
          <el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <el-select v-model="filter.ownerId" placeholder="负责人" clearable style="width: 110px">
          <el-option v-for="m in MEMBERS" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
        <el-select v-model="filter.status" placeholder="状态" clearable style="width: 110px">
          <el-option v-for="s in STATUS" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </div>
    </div>

    <!-- 看板视图 -->
    <div v-show="viewMode === 'kanban'" class="kanban thin-scroll">
      <div class="kanban-col" v-for="st in KANBAN_STATUS" :key="st">
        <div class="col-header" :style="{ borderTopColor: statusMap[st].color }">
          <span class="col-title">
            <span class="dot" :style="{ background: statusMap[st].color }"></span>
            {{ statusMap[st].label }}
          </span>
          <span class="col-count">{{ columns[st].length }}</span>
        </div>
        <draggable
          v-model="columns[st]"
          group="orders"
          item-key="id"
          class="col-body thin-scroll"
          :animation="180"
          ghost-class="ghost"
          @change="(e) => onDragChange(e, st)"
        >
          <template #item="{ element }">
            <div class="card" :class="{ overdue: isOverdue(element), unread: isUnread(element) }" @click="openDetail(element)">
              <span v-if="isUnread(element)" class="new-badge">NEW</span>
              <div class="card-top">
                <el-tag size="small" :style="channelStyle(element.channel)" effect="plain">
                  {{ channelMap[element.channel]?.label }}
                </el-tag>
                <span class="order-no">{{ element.orderNo }}</span>
                <span class="prio" :style="{ background: priorityMap[element.priority]?.color }">
                  {{ priorityMap[element.priority]?.label }}
                </span>
              </div>
              <div class="card-title">{{ element.title }}</div>
              <div class="card-customer">
                <el-icon><User /></el-icon> {{ element.customer || '未填客户' }}
                <span v-if="element.attachments && element.attachments.length" class="img-flag">
                  <el-icon><Paperclip /></el-icon>{{ element.attachments.length }}
                </span>
                <span v-if="element.revisions > 0" class="rev-flag">改{{ element.revisions }}</span>
              </div>
              <div class="card-foot">
                <el-avatar :size="22" :style="{ background: memberMap[element.ownerId]?.color, fontSize: '12px' }">
                  {{ memberMap[element.ownerId]?.name?.slice(-1) }}
                </el-avatar>
                <span class="deadline" :class="{ red: isOverdue(element) }">
                  <el-icon><Clock /></el-icon> {{ element.deadline || '无' }}
                </span>
                <span class="amount">¥{{ element.amount || 0 }}</span>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- 列表视图 -->
    <el-card v-show="viewMode === 'list'" shadow="never" class="list-card">
      <el-table :data="filteredOrders" stripe @row-click="openDetail" style="cursor: pointer">
        <el-table-column prop="orderNo" label="编号" width="130" />
        <el-table-column label="项目名" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="isUnread(row)" class="dot-unread"></span>
            {{ row.title }}
            <el-icon v-if="row.attachments && row.attachments.length" class="inline-pic"><Paperclip /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="90">
          <template #default="{ row }">
            <el-tag size="small" :style="channelStyle(row.channel)" effect="plain">
              {{ channelMap[row.channel]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="customer" label="客户" width="120" show-overflow-tooltip />
        <el-table-column label="负责人" width="90">
          <template #default="{ row }">{{ memberMap[row.ownerId]?.name }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status]?.type" effect="light">
              {{ statusMap[row.status]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ row.amount || 0 }}</template>
        </el-table-column>
        <el-table-column label="截止" width="120">
          <template #default="{ row }">
            <span :class="{ 'red-text': isOverdue(row) }">{{ row.deadline || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
            <el-button link type="warning" @click.stop="openNotebook(row)">记事本</el-button>
            <el-button link type="primary" @click.stop="openDialog(row)">编辑</el-button>
            <el-button link type="danger" @click.stop="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <OrderDialog v-model:visible="dialogVisible" :data="editing" @save="handleSave" />

    <!-- 详情抽屉 -->
    <OrderDetail v-model:visible="detailVisible" :order="active" @edit="openDialog" @delete="handleDelete" @notebook="openNotebook" />

    <!-- 项目记事本 -->
    <NotebookDialog v-model:visible="notebookVisible" :order="notebookOrder" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Grid, List } from '@element-plus/icons-vue'
import OrderDialog from './components/OrderDialog.vue'
import OrderDetail from './components/OrderDetail.vue'
import NotebookDialog from '@/components/NotebookDialog.vue'
import { orders, createOrder, editOrder, removeOrder, setStatus, currentMember } from '@/mock/store'
import { todayStr as todayLocal } from '@/utils/date'
import {
  STATUS, CHANNEL, MEMBERS, KANBAN_STATUS,
  statusMap, channelMap, priorityMap, memberMap
} from '@/constants/options'

const viewMode = ref('kanban')
const filter = reactive({ keyword: '', channel: '', ownerId: '', status: '' })

const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr

const channelStyle = (val) => {
  const c = channelMap[val]
  return c ? { color: c.color, borderColor: c.color } : {}
}

// 当前角色是否对该单有未读新动态
const isUnread = (o) => o.unread?.includes(currentMember.value.id)

const filteredOrders = computed(() =>
  orders.filter((o) => {
    if (filter.channel && o.channel !== filter.channel) return false
    if (filter.ownerId && o.ownerId !== filter.ownerId) return false
    if (filter.status && o.status !== filter.status) return false
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase()
      if (!`${o.title}${o.customer}`.toLowerCase().includes(kw)) return false
    }
    return true
  })
)

// 看板分列
const columns = reactive({ pending: [], doing: [], review: [], done: [] })
function rebuild() {
  KANBAN_STATUS.forEach((s) => {
    columns[s] = filteredOrders.value.filter((o) => o.status === s)
  })
}
watch(filteredOrders, rebuild, { immediate: true, deep: true })

function onDragChange(evt, targetStatus) {
  if (evt.added) {
    const moved = evt.added.element
    if (moved && moved.status !== targetStatus) {
      setStatus(moved.id, targetStatus)
      ElMessage.success(`「${moved.title}」已移到 ${statusMap[targetStatus].label}`)
    }
  }
}

// 弹窗 / 抽屉状态
const dialogVisible = ref(false)
const editing = ref(null)
const detailVisible = ref(false)
const active = ref(null)
const notebookVisible = ref(false)
const notebookOrder = ref(null)

function openNotebook(row) {
  notebookOrder.value = row
  notebookVisible.value = true
}

function openDialog(row) {
  editing.value = row && row.id ? { ...row } : null
  dialogVisible.value = true
}
function openDetail(row) {
  active.value = row
  detailVisible.value = true
}
function handleSave(data) {
  if (data.id) {
    editOrder(data)
    ElMessage.success('已更新')
  } else {
    createOrder(data)
    ElMessage.success('接单成功')
  }
  dialogVisible.value = false
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
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.toolbar .right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 看板 */
.kanban {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
  align-items: flex-start;
}
.kanban-col {
  flex: 1;
  min-width: 250px;
  background: #f4f5f7;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 170px);
}
.col-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-top: 3px solid #ccc;
  border-radius: 8px 8px 0 0;
  background: #fff;
}
.col-title {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.col-count {
  background: #e4e7ed;
  color: #606266;
  border-radius: 10px;
  font-size: 12px;
  padding: 1px 9px;
}
.col-body {
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 80px;
}
.card {
  position: relative;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  cursor: pointer;
  border-left: 3px solid transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, transform 0.15s;
}
.card.unread {
  border-left-color: #f56c6c;
  box-shadow: 0 0 0 1px #fde2e2, 0 1px 3px rgba(0, 0, 0, 0.08);
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
  z-index: 2;
}
.img-flag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  color: #409eff;
}
.rev-flag {
  margin-left: 6px;
  background: #fef0f0;
  color: #f56c6c;
  font-size: 11px;
  border-radius: 4px;
  padding: 0 5px;
}
.dot-unread {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f56c6c;
  margin-right: 5px;
  vertical-align: middle;
}
.inline-pic {
  color: #409eff;
  vertical-align: -2px;
  margin-left: 4px;
}
.card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14);
  transform: translateY(-1px);
}
.card.overdue {
  border-left-color: #f56c6c;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.order-no {
  font-size: 12px;
  color: #c0c4cc;
}
.prio {
  margin-left: auto;
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 1px 6px;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  margin-bottom: 6px;
  color: #303133;
}
.card-customer {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
}
.card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}
.card-foot .deadline {
  display: flex;
  align-items: center;
  gap: 3px;
}
.card-foot .deadline.red {
  color: #f56c6c;
  font-weight: 600;
}
.card-foot .amount {
  margin-left: auto;
  color: #e6a23c;
  font-weight: 600;
}
.ghost {
  opacity: 0.4;
  background: #ecf5ff;
}
.red-text {
  color: #f56c6c;
  font-weight: 600;
}
.list-card {
  border-radius: 8px;
}
</style>
