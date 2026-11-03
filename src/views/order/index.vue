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
          placeholder="搜项目名 / 客户 / 联系方式 / 需求"
          :prefix-icon="Search"
          clearable
          style="width: 250px"
        />
        <el-select v-model="filter.channel" placeholder="渠道" clearable style="width: 110px">
          <el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <el-date-picker
          v-model="createRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="创建开始"
          end-placeholder="创建结束"
          style="width: 230px"
        />
        <el-button v-if="hasFilter" link type="primary" @click="resetFilter">清空筛选</el-button>
        <el-button :icon="Download" :loading="exporting" @click="doExport">导出 Excel</el-button>
      </div>
    </div>

    <!-- 一键筛选：点一下就切，数字是现在有几单 -->
    <div class="quick-bar">
      <div class="chip-row">
        <span class="chip-label">看什么</span>
        <span
          v-for="q in QUICK"
          :key="q.key"
          class="qchip"
          :class="{ on: quick === q.key, warn: q.warn && quickCounts[q.key] > 0 }"
          @click="setQuick(q.key)"
        >{{ q.label }}<b>{{ quickCounts[q.key] }}</b></span>
      </div>
      <div v-if="showPeople" class="chip-row">
        <span class="chip-label">看谁的</span>
        <span class="qchip" :class="{ on: !filter.ownerId }" @click="filter.ownerId = ''">所有人</span>
        <span
          v-for="p in people"
          :key="p.m.id"
          class="qchip"
          :class="{ on: filter.ownerId === p.m.id }"
          @click="filter.ownerId = p.m.id"
        >
          <el-avatar :size="18" :style="{ background: p.m.color, fontSize: '10px' }">{{ p.m.name.slice(-1) }}</el-avatar>
          {{ p.m.id === currentMember.id ? '我自己' : p.m.name }}<b>{{ p.active }}</b>
        </span>
      </div>
    </div>

    <!-- 谁能看到什么，直接说人话 -->
    <div v-if="scopeHint" class="scope-hint">
      <el-icon><View /></el-icon>
      <span>{{ scopeHint }}</span>
    </div>

    <!-- 看板视图 -->
    <div v-show="viewMode === 'kanban'" class="kanban thin-scroll">
      <div class="kanban-col" v-for="st in KANBAN_STATUS" :key="st">
        <div class="col-header" :style="{ borderTopColor: statusMap[st].color }">
          <span class="col-title">
            <span class="dot" :style="{ background: statusMap[st].color }"></span>
            {{ statusMap[st].label }}
          </span>
          <span class="col-count">{{ columnTotals[st] }}</span>
        </div>
        <div v-if="columnTotals[st] > columns[st].length" class="col-more">
          只显示最近 {{ columns[st].length }} 个，更早的请切到「列表」查看
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
              <div v-if="element.assignState === 'pending' || Number(element.pendingApprovals) > 0" class="card-flags">
                <span v-if="element.assignState === 'pending'" class="flag amber">{{ isBoss ? '等 ' + (memberMap[element.ownerId]?.name || '负责人') + ' 接收' : '待接收' }}</span>
                <span v-if="Number(element.pendingApprovals) > 0" class="flag red">{{ element.pendingApprovals }} 条申请待批</span>
              </div>
              <div class="card-customer">
                <el-icon><User /></el-icon> {{ element.customer || '未填客户' }}
                <span v-if="element.attachmentCount || (element.attachments && element.attachments.length)" class="img-flag">
                  <el-icon><Paperclip /></el-icon>{{ element.attachmentCount || element.attachments.length }}
                </span>
                <span v-if="element.revisions > 0" class="rev-flag">改{{ element.revisions }}</span>
              </div>
              <div class="card-foot">
                <AssignMenu :order="element" plain>
                  <span class="who" title="点一下改派给别人">
                    <el-avatar :size="22" :style="{ background: memberMap[element.ownerId]?.color, fontSize: '12px' }">
                      {{ memberMap[element.ownerId]?.name?.slice(-1) }}
                    </el-avatar>
                    <span v-if="MEMBERS.length > 1" class="owner-name">{{ memberMap[element.ownerId]?.name }}</span>
                  </span>
                </AssignMenu>
                <span class="deadline" :class="{ red: isOverdue(element) }">
                  <el-icon><Clock /></el-icon> <span :title="element.deadline || ''">{{ shortDate(element.deadline) }}</span>
                </span>
                <span class="amount" title="点击记收款" @click.stop="openPay(element)">
                  ¥{{ element.amount || 0 }}
                  <i v-if="payText(element)" class="pay-flag" :class="payState(element)">{{ payText(element) }}</i>
                </span>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- 列表视图 -->
    <el-card v-show="viewMode === 'list'" shadow="never" class="list-card">
      <el-table :data="pagedOrders" stripe @row-click="openDetail" style="cursor: pointer">
        <el-table-column prop="orderNo" label="编号" width="130" />
        <el-table-column label="项目名" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="isUnread(row)" class="dot-unread"></span>
            {{ row.title }}
            <el-icon v-if="row.attachmentCount || (row.attachments && row.attachments.length)" class="inline-pic"><Paperclip /></el-icon>
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
          <template #default="{ row }">
            <AssignMenu :order="row" plain>
              <span class="who" title="点一下改派给别人">{{ memberMap[row.ownerId]?.name }}</span>
            </AssignMenu>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status]?.type" effect="light">
              {{ statusMap[row.status]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报价" width="90">
          <template #default="{ row }">¥{{ row.amount || 0 }}</template>
        </el-table-column>
        <el-table-column label="收款" width="120">
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="PAY_STATE[payState(row)].type"
              effect="light"
              class="pay-tag"
              title="点击记收款"
              @click.stop="openPay(row)"
            >{{ payText(row) || PAY_STATE[payState(row)].label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="截止" width="120">
          <template #default="{ row }">
            <span :class="{ 'red-text': isOverdue(row) }">{{ row.deadline || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
            <el-button link type="success" @click.stop="openPay(row)">收款</el-button>
            <el-button
              v-if="canFinish(row)"
              link
              type="primary"
              @click.stop="changeStatus(row, isBoss ? 'done' : 'review')"
            >{{ isBoss ? '完成' : '提交验收' }}</el-button>
            <el-button
              v-if="!isBoss && row.assignState === 'pending'"
              link
              type="warning"
              @click.stop="openDetail(row)"
            >去接收</el-button>
            <el-dropdown trigger="click" @command="(c) => onMore(c, row)">
              <el-button link type="primary" @click.stop>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="notebook">记事本</el-dropdown-item>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item
                    v-for="(s, i) in moreStatuses(row)"
                    :key="s.value"
                    :command="'status:' + s.value"
                    :divided="i === 0"
                  >设为「{{ s.label }}」</el-dropdown-item>
                  <template v-if="isBoss">
                    <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
                  </template>
                  <template v-else>
                    <el-dropdown-item command="request:amount" divided>申请改报价</el-dropdown-item>
                    <el-dropdown-item v-if="!['done', 'cancelled'].includes(row.status)" command="request:cancel">申请取消</el-dropdown-item>
                    <el-dropdown-item command="request:delete">申请删除</el-dropdown-item>
                  </template>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="hasFilter ? '没有符合筛选条件的项目' : '还没有项目'" />
        </template>
      </el-table>
      <div class="list-pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="filteredOrders.length"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <OrderDialog v-model:visible="dialogVisible" :data="editing" @save="handleSave" />

    <!-- 详情抽屉 -->
    <OrderDetail v-model:visible="detailVisible" :order="active" :loading="detailLoading" @edit="openDialog" @delete="handleDelete" @notebook="openNotebook" />

    <!-- 项目记事本 -->
    <NotebookDialog v-model:visible="notebookVisible" :order="notebookOrder" />

    <!-- 记收款 -->
    <PaymentDialog v-model:visible="payVisible" :order="payOrder" />

    <!-- 员工申请改报价 / 取消 / 删除 -->
    <ApprovalRequestDialog v-model:visible="reqVisible" :order="reqOrder" :type="reqType" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Grid, List, Download, ArrowDown, View } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import OrderDialog from './components/OrderDialog.vue'
import OrderDetail from './components/OrderDetail.vue'
import NotebookDialog from '@/components/NotebookDialog.vue'
import PaymentDialog from '@/components/PaymentDialog.vue'
import ApprovalRequestDialog from '@/components/ApprovalRequestDialog.vue'
import AssignMenu from '@/components/AssignMenu.vue'
import { changeOrderStatus } from '@/utils/settle'
import {
  orders, getOrder, createOrder, editOrder, removeOrder, currentMember, isBoss, exportOrders
} from '@/mock/store'
import { todayStr as todayLocal } from '@/utils/date'
import { PAY_STATE, payState, payFilterOk, owed, money } from '@/utils/payment'
import {
  STATUS, CHANNEL, MEMBERS, KANBAN_STATUS,
  statusMap, channelMap, priorityMap, memberMap
} from '@/constants/options'

// 记住上次用的是看板还是列表
const VIEW_KEY = 'xc.orderView'
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'kanban'
  } catch (e) {
    return 'kanban'
  }
}
const viewMode = ref(readView())
watch(viewMode, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch (e) {
    // 存不了就算了，只是下次不记得
  }
})
const filter = reactive({ keyword: '', channel: '', ownerId: '', status: '', paid: '', overdueOnly: false })
const createRange = ref(null)

// 从工作台「我的团队」点进来：地址里带着 ?owner=某个人，直接只看这个人的单子
const route = useRoute()
watch(
  () => route.query.owner,
  (v) => {
    filter.ownerId = v ? Number(v) : ''
  },
  { immediate: true }
)
// ---- 一键筛选条 ----
// 「看什么」互斥：全部 / 各状态 / 已逾期 / 还欠款；「看谁的」是另一个维度，可以叠加
const quick = computed(() => (filter.overdueOnly ? 'overdue' : filter.paid === '0' ? 'owing' : filter.status || 'all'))
function setQuick(key) {
  filter.status = ''
  filter.overdueOnly = false
  filter.paid = ''
  if (key === 'overdue') filter.overdueOnly = true
  else if (key === 'owing') filter.paid = '0'
  else if (key !== 'all') filter.status = key
}
const scopedOrders = computed(() => orders.filter((o) => !filter.ownerId || o.ownerId === filter.ownerId))
const quickCounts = computed(() => {
  const c = { all: scopedOrders.value.length, overdue: 0, owing: 0, pending: 0, doing: 0, review: 0, done: 0, cancelled: 0 }
  for (const o of scopedOrders.value) {
    if (c[o.status] !== undefined) c[o.status]++
    if (isOverdue(o)) c.overdue++
    if (payFilterOk(o, '0')) c.owing++
  }
  return c
})
const QUICK = computed(() => {
  const list = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待确认' },
    { key: 'doing', label: '进行中' }
  ]
  // 一个人用时没有“验收”这一步；有员工、或确实有待验收的单子时才显示
  if (MEMBERS.length > 1 || quickCounts.value.review > 0) list.push({ key: 'review', label: '待验收' })
  list.push(
    { key: 'overdue', label: '已逾期', warn: true },
    { key: 'owing', label: '还欠款', warn: true },
    { key: 'done', label: '已完成' }
  )
  return list
})
const showPeople = computed(() => isBoss.value && MEMBERS.length > 1)
const people = computed(() =>
  MEMBERS.map((m) => ({
    m,
    active: orders.filter((o) => o.ownerId === m.id && !['done', 'cancelled'].includes(o.status)).length
  }))
)

const scopeHint = computed(() => {
  if (!isBoss.value) return '这里只有你自己的单子：老板能看到你的进度，别人的单子你看不到。'
  if (MEMBERS.length <= 1) return ''
  const who = filter.ownerId ? memberMap[filter.ownerId]?.name : ''
  if (who) {
    return filter.ownerId === currentMember.value.id ? '现在只看你自己的单子。' : `现在只看 ${who} 手上的单子。`
  }
  return '你能看到全公司所有人的单子，每个人只能看到自己的。'
})

const todayStr = todayLocal()
const isOverdue = (o) =>
  ['pending', 'doing', 'review'].includes(o.status) && o.deadline && o.deadline < todayStr

// 卡片上日期只留 月-日（今年的），省地方；鼠标放上去能看完整日期
const shortDate = (d) => (!d ? '无' : d.startsWith(String(new Date().getFullYear())) ? d.slice(5) : d)

const channelStyle = (val) => {
  const c = channelMap[val]
  return c ? { color: c.color, borderColor: c.color } : {}
}

// 当前角色是否对该单有未读新动态
const isUnread = (o) => o.unread?.includes(currentMember.value.id)

// 筛选条件与服务端导出的条件保持一致（见 exportParams）
const filteredOrders = computed(() =>
  orders.filter((o) => {
    if (filter.channel && o.channel !== filter.channel) return false
    if (filter.ownerId && o.ownerId !== filter.ownerId) return false
    if (filter.status && o.status !== filter.status) return false
    if (!payFilterOk(o, filter.paid)) return false
    if (filter.overdueOnly && !isOverdue(o)) return false
    if (createRange.value) {
      const day = String(o.createTime || '').slice(0, 10)
      if (day < createRange.value[0] || day > createRange.value[1]) return false
    }
    if (filter.keyword) {
      const kw = filter.keyword.trim().toLowerCase()
      const hay = `${o.title} ${o.customer || ''} ${o.orderNo || ''} ${o.contact || ''} ${o.requirement || ''}`
      if (!hay.toLowerCase().includes(kw)) return false
    }
    return true
  })
)

const hasFilter = computed(
  () =>
    !!(filter.keyword || filter.channel || filter.ownerId || filter.status || filter.paid ||
       filter.overdueOnly || createRange.value)
)
function resetFilter() {
  Object.assign(filter, { keyword: '', channel: '', ownerId: '', status: '', paid: '', overdueOnly: false })
  createRange.value = null
}

// 列表视图分页：项目多了也只渲染当前页
const page = ref(1)
const pageSize = ref(20)
const pagedOrders = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredOrders.value.slice(start, start + pageSize.value)
})
watch([filter, createRange, pageSize], () => { page.value = 1 }, { deep: true })
// 删除/恢复后总数变少，页码不能停在已经没有数据的位置
watch(
  () => filteredOrders.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / pageSize.value))
    if (page.value > maxPage) page.value = maxPage
  }
)

// 看板分列：已完成越积越多，只显示最近的一部分，完整的在列表里看
const KANBAN_LIMIT = { done: 30 }
const columns = reactive({ pending: [], doing: [], review: [], done: [] })
const columnTotals = reactive({ pending: 0, doing: 0, review: 0, done: 0 })
function rebuild() {
  KANBAN_STATUS.forEach((s) => {
    const all = filteredOrders.value.filter((o) => o.status === s)
    columnTotals[s] = all.length
    columns[s] = KANBAN_LIMIT[s] ? all.slice(0, KANBAN_LIMIT[s]) : all
  })
}
watch(filteredOrders, rebuild, { immediate: true, deep: true })

// 导出 Excel：把当前的筛选条件交给服务端，导出结果和屏幕上看到的一致（服务端只会导出你有权看的项目）
const exporting = ref(false)
function exportParams() {
  return {
    keyword: filter.keyword.trim(),
    channel: filter.channel,
    ownerId: filter.ownerId,
    status: filter.status,
    paid: filter.paid,
    overdue: filter.overdueOnly ? '1' : '',
    createFrom: createRange.value?.[0] || '',
    createTo: createRange.value?.[1] || ''
  }
}
async function doExport() {
  exporting.value = true
  try {
    const name = await exportOrders(exportParams())
    ElMessage.success(`已导出：${name}`)
  } catch (e) {
    ElMessage.error(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function onDragChange(evt, targetStatus) {
  if (!evt.added) return
  const moved = evt.added.element
  if (!moved || moved.status === targetStatus) return
  try {
    await changeOrderStatus(moved, targetStatus)
    ElMessage.success(`「${moved.title}」已移到 ${statusMap[targetStatus].label}`)
  } catch (e) {
    // 服务器没改成功：把卡片放回原来的列，并说清楚
    ElMessage.error((e.message || '修改状态失败') + '，已放回原位')
    rebuild()
  }
}

// 列表里一键改状态（完成 / 更多里的设为…）
async function changeStatus(row, status) {
  try {
    await changeOrderStatus(row, status)
    ElMessage.success(`「${row.title}」→ ${statusMap[status].label}`)
  } catch (e) {
    ElMessage.error(e.message || '修改状态失败')
  }
}

function onMore(command, row) {
  if (command === 'notebook') openNotebook(row)
  else if (command === 'edit') openDialog(row)
  else if (command === 'delete') handleDelete(row)
  else if (command.startsWith('status:')) changeStatus(row, command.slice(7))
  else if (command.startsWith('request:')) {
    reqOrder.value = row
    reqType.value = command.slice(8)
    reqVisible.value = true
  }
}

// 员工不能自己把项目标成“已完成 / 已取消”（走提交验收 / 申请），所以“设为…”里不给这两项
const moreStatuses = (row) =>
  STATUS.filter((x) => x.value !== row.status && (isBoss.value || ['pending', 'doing', 'review'].includes(x.value)))
// 老板：没完成的都能一键完成；员工：进行中的能一键提交验收（刚派来还没接收的先去接收）
const canFinish = (row) => {
  if (['done', 'cancelled'].includes(row.status)) return false
  if (isBoss.value) return true
  return row.status === 'doing' && row.assignState !== 'pending'
}
const reqVisible = ref(false)
const reqOrder = ref(null)
const reqType = ref('amount')

// 收款
const payVisible = ref(false)
const payOrder = ref(null)
function openPay(row) {
  payOrder.value = row
  payVisible.value = true
}
// 看板/列表上的收款小标签：没收 → 未收；收了一部分 → 欠多少；收清 → 已收清；没报价 → 不显示
function payText(o) {
  const st = payState(o)
  if (st === 'none') return '未收'
  if (st === 'part') return '欠' + money(owed(o))
  if (st === 'full') return '已收清'
  return ''
}

// 弹窗 / 抽屉状态
const dialogVisible = ref(false)
const editing = ref(null)
const detailVisible = ref(false)
const detailLoading = ref(false)
const active = ref(null)
const notebookVisible = ref(false)
const notebookOrder = ref(null)

function openNotebook(row) {
  notebookOrder.value = row
  notebookVisible.value = true
}

async function openDialog(row) {
  if (!row?.id) {
    editing.value = null
    dialogVisible.value = true
    return
  }
  try {
    editing.value = { ...(await getOrder(row.id)) }
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error('加载项目失败：' + e.message)
  }
}
async function openDetail(row) {
  active.value = row
  detailVisible.value = true
  detailLoading.value = true
  try {
    active.value = await getOrder(row.id)
  } catch (e) {
    ElMessage.error('加载项目失败：' + e.message)
  } finally {
    detailLoading.value = false
  }
}
async function handleSave(data) {
  try {
    if (data.id) {
      await editOrder(data)
      ElMessage.success('已更新')
    } else {
      await createOrder(data)
      ElMessage.success('接单成功')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}
function handleDelete(row) {
  ElMessageBox.confirm(`确定删除「${row.title}」吗？删除后会放进「回收站」，可以随时恢复。`, '提示', { type: 'warning' })
    .then(async () => {
      try {
        await removeOrder(row.id)
        detailVisible.value = false
        ElMessage.success('已放进回收站')
      } catch (e) {
        ElMessage.error(e.message || '删除失败')
      }
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
.col-more {
  padding: 6px 12px;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}
.list-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
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
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-foot .deadline.red {
  color: #f56c6c;
  font-weight: 600;
}
.card-foot .amount {
  margin-left: auto;
  color: #e6a23c;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.pay-flag {
  font-style: normal;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  padding: 0 5px;
  margin-left: 4px;
}
.pay-flag.none {
  color: #f56c6c;
  background: #fef0f0;
}
.pay-flag.part {
  color: #e6a23c;
  background: #fdf6ec;
}
.pay-flag.full {
  color: #67c23a;
  background: #f0f9eb;
}
.pay-tag {
  cursor: pointer;
}
.quick-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.chip-label {
  width: 48px;
  font-size: 12px;
  color: #909399;
}
.qchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}
.qchip b {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
.qchip:hover {
  border-color: #409eff;
}
.qchip.on {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}
.qchip.on b {
  color: #409eff;
}
.qchip.warn b {
  color: #f56c6c;
}
.card-flags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: -2px 0 8px;
}
.flag {
  font-size: 11px;
  border-radius: 4px;
  padding: 0 6px;
  line-height: 18px;
}
.flag.amber {
  color: #e6a23c;
  background: #fdf6ec;
}
.flag.red {
  color: #f56c6c;
  background: #fef0f0;
}
.who {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.who:hover {
  color: #409eff;
}
.scope-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -4px 0 12px;
  font-size: 13px;
  color: #909399;
}
.owner-name {
  color: #606266;
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
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
