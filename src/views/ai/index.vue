<template>
  <div class="ai-page">
    <div class="page-head">
      <div>
        <h1>AI 开发队列</h1>
        <p>云端编排，自有算力执行；每个结果都以独立 PR 等待人工审核。</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Setting" @click="projectDrawer = true">代码项目</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!enabledProjectCount" @click="taskDialog = true">新建任务</el-button>
      </div>
    </div>

    <div class="status-strip" aria-label="AI 任务状态汇总">
      <button v-for="item in summary" :key="item.key" type="button" @click="filter.status = item.filter">
        <span>{{ item.label }}</span>
        <b :class="item.key">{{ item.value }}</b>
      </button>
      <div class="capacity-note">
        <el-icon><Monitor /></el-icon>
        <span>{{ enabledProjectCount }} 个项目已启用 · Worker 建议并发 1–2</span>
      </div>
    </div>

    <div class="filters">
      <el-select v-model="filter.projectId" placeholder="全部项目" clearable style="width: 180px">
        <el-option v-for="item in projects" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="filter.status" placeholder="全部状态" clearable style="width: 150px">
        <el-option label="失败 / 驳回" value="problem" />
        <el-option v-for="(item, key) in TASK_STATUS" :key="key" :label="item.label" :value="key" />
      </el-select>
      <el-input
        v-model="filter.keyword"
        :prefix-icon="Search"
        clearable
        placeholder="搜索标题或任务 ID"
        style="width: 240px"
        @keyup.enter="loadTasks(true)"
      />
      <el-button :icon="Refresh" :loading="loading" @click="loadAll(true)">刷新</el-button>
      <span class="updated">{{ lastUpdated ? `更新于 ${lastUpdated}` : '' }}</span>
    </div>

    <el-card shadow="never" class="task-panel">
      <el-table
        v-loading="loading"
        :data="tasks"
        row-key="id"
        stripe
        class="task-table"
        @row-click="openTask"
      >
        <el-table-column prop="id" label="ID" width="72" />
        <el-table-column label="任务" min-width="250">
          <template #default="{ row }">
            <div class="task-title">{{ row.title }}</div>
            <div class="task-sub">{{ row.projectName }}<span v-if="row.orderId"> · 订单 {{ row.orderId }}</span></div>
          </template>
        </el-table-column>
        <el-table-column label="风险" width="72" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="RISK[row.riskLevel]?.type" effect="plain">{{ RISK[row.riskLevel]?.label || row.riskLevel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="112">
          <template #default="{ row }">
            <el-tag size="small" :type="TASK_STATUS[row.status]?.type" effect="light">
              {{ TASK_STATUS[row.status]?.label || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="执行" min-width="150">
          <template #default="{ row }">
            <div v-if="row.workerId" class="worker">{{ row.workerId }}</div>
            <span v-else class="muted">等待 Worker</span>
            <div v-if="row.validationPassed != null" class="validation-state">
              {{ Number(row.validationPassed) === 1 ? '验证通过' : '验证未通过' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="结果" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <a v-if="row.prUrl" :href="row.prUrl" target="_blank" rel="noopener noreferrer" @click.stop>查看 PR</a>
            <span v-else-if="row.errorMessage" class="error-text">{{ row.errorMessage }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="172">
          <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="158" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openTask(row)">详情</el-button>
            <el-button v-if="row.status === 'draft'" link type="primary" @click.stop="doDispatch(row)">排队</el-button>
            <el-button v-if="['failed', 'rejected'].includes(row.status)" link type="primary" @click.stop="doRetry(row)">重试</el-button>
            <el-button v-if="row.status === 'awaiting_review'" link type="success" @click.stop="doApprove(row)">审核</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="projects.length ? '当前筛选下没有 AI 任务' : '先添加代码项目，再创建 AI 任务'">
            <el-button v-if="!projects.length" type="primary" @click="openProject()">添加代码项目</el-button>
          </el-empty>
        </template>
      </el-table>
    </el-card>

    <TaskDialog
      v-model:visible="taskDialog"
      :projects="projects"
      :saving="savingTask"
      @submit="saveTask"
    />
    <ProjectDialog
      v-model:visible="projectDialog"
      :data="editingProject"
      :saving="savingProject"
      @submit="saveProject"
    />
    <TaskDetail
      v-model:visible="detailVisible"
      :task="activeTask"
      :loading="detailLoading"
      :logs="logs"
      :logs-loading="logsLoading"
      @refresh="refreshDetail"
      @load-logs="loadLogs"
      @dispatch="doDispatch"
      @retry="doRetry"
      @approve="doApprove"
      @reject="doReject"
      @cancel="doCancel"
    />

    <el-drawer v-model="projectDrawer" class="ai-project-drawer" title="代码项目" :size="projectDrawerSize">
      <div class="project-toolbar">
        <div>
          <b>项目与执行配置</b>
          <span>仓库凭证不进入控制面</span>
        </div>
        <el-button type="primary" :icon="Plus" @click="openProject()">添加项目</el-button>
      </div>
      <el-table :data="projects" stripe>
        <el-table-column label="项目" min-width="180">
          <template #default="{ row }">
            <div class="task-title">{{ row.name }}</div>
            <div class="task-sub repo">{{ row.repoUrl }}</div>
          </template>
        </el-table-column>
        <el-table-column label="执行" width="130">
          <template #default="{ row }">{{ row.provider }}<span v-if="row.model"> / {{ row.model }}</span></template>
        </el-table-column>
        <el-table-column prop="maxParallel" label="并发" width="64" align="center" />
        <el-table-column label="状态" width="76">
          <template #default="{ row }">
            <el-tag size="small" :type="Number(row.enabled) === 1 ? 'success' : 'info'">
              {{ Number(row.enabled) === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="72" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="openProject(row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Plus, Refresh, Search, Setting } from '@element-plus/icons-vue'
import TaskDialog from './components/TaskDialog.vue'
import ProjectDialog from './components/ProjectDialog.vue'
import TaskDetail from './components/TaskDetail.vue'
import { RISK, TASK_STATUS, formatTime } from './options'
import {
  approveAiTask,
  cancelAiTask,
  createAiProject,
  createAiTask,
  dispatchAiTask,
  getAiProject,
  getAiTask,
  listAiProjects,
  listAiTasks,
  listAttemptLogs,
  rejectAiTask,
  retryAiTask,
  updateAiProject
} from '@/api/ai'

const projects = ref([])
const allTasks = ref([])
const loading = ref(false)
const lastUpdated = ref('')
const filter = reactive({ projectId: '', status: '', keyword: '' })
const taskDialog = ref(false)
const savingTask = ref(false)
const projectDrawer = ref(false)
const projectDialog = ref(false)
const editingProject = ref(null)
const savingProject = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const activeTask = ref(null)
const logs = ref([])
const logsLoading = ref(false)
let poller = null
const projectDrawerSize = ref(window.innerWidth <= 800 ? '100vw' : '760px')
const syncProjectDrawerSize = () => { projectDrawerSize.value = window.innerWidth <= 800 ? '100vw' : '760px' }

const enabledProjectCount = computed(() => projects.value.filter((item) => Number(item.enabled) === 1).length)
const tasks = computed(() => allTasks.value.filter((item) => {
  if (filter.projectId && item.projectId !== filter.projectId) return false
  if (filter.status === 'problem' && !['failed', 'rejected'].includes(item.status)) return false
  if (filter.status && filter.status !== 'problem' && item.status !== filter.status) return false
  if (filter.keyword) {
    const keyword = filter.keyword.trim().toLowerCase()
    if (keyword && !`${item.id} ${item.title}`.toLowerCase().includes(keyword)) return false
  }
  return true
}))
const summary = computed(() => {
  const count = (states) => allTasks.value.filter((item) => states.includes(item.status)).length
  return [
    { key: 'active', label: '执行队列', value: count(['queued', 'claimed', 'running']), filter: '' },
    { key: 'review', label: '待审核', value: count(['awaiting_review']), filter: 'awaiting_review' },
    { key: 'failed', label: '失败 / 驳回', value: count(['failed', 'rejected']), filter: 'problem' },
    { key: 'approved', label: '已批准', value: count(['approved']), filter: 'approved' }
  ]
})

async function loadProjects() {
  projects.value = (await listAiProjects()) || []
}
async function loadTasks(showError = false) {
  try {
    allTasks.value = (await listAiTasks()) || []
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (error) {
    if (showError) ElMessage.error(error.message || '加载 AI 任务失败')
  }
}
async function loadAll(showError = false) {
  if (document.visibilityState !== 'visible') return
  loading.value = true
  try {
    await Promise.all([loadProjects(), loadTasks(showError)])
    if (detailVisible.value && activeTask.value?.id) await refreshDetail()
  } catch (error) {
    if (showError) ElMessage.error(error.message || '加载 AI 开发队列失败')
  } finally {
    loading.value = false
  }
}

async function saveTask(data) {
  savingTask.value = true
  try {
    const created = await createAiTask(data)
    taskDialog.value = false
    ElMessage.success(data.dispatch ? '任务已进入执行队列' : '任务草稿已保存')
    await loadTasks()
    await openTask(created)
  } catch (error) {
    ElMessage.error(error.message || '创建任务失败')
  } finally {
    savingTask.value = false
  }
}

async function openProject(row = null) {
  try {
    editingProject.value = row?.id ? await getAiProject(row.id) : null
    projectDialog.value = true
  } catch (error) {
    ElMessage.error(error.message || '读取项目配置失败')
  }
}
async function saveProject(data) {
  savingProject.value = true
  try {
    if (data.id) await updateAiProject(data)
    else await createAiProject(data)
    projectDialog.value = false
    ElMessage.success('代码项目已保存')
    await loadProjects()
  } catch (error) {
    ElMessage.error(error.message || '保存项目失败')
  } finally {
    savingProject.value = false
  }
}

async function openTask(row) {
  detailVisible.value = true
  activeTask.value = row
  logs.value = []
  await refreshDetail()
}
async function refreshDetail() {
  if (!activeTask.value?.id) return
  detailLoading.value = true
  try {
    activeTask.value = await getAiTask(activeTask.value.id)
  } catch (error) {
    ElMessage.error(error.message || '读取任务详情失败')
  } finally {
    detailLoading.value = false
  }
}
async function loadLogs() {
  const attemptId = activeTask.value?.currentAttemptId
  if (!attemptId) return
  logsLoading.value = true
  try {
    logs.value = (await listAttemptLogs(attemptId, { afterSeq: 0, limit: 500 })) || []
  } catch (error) {
    ElMessage.error(error.message || '读取运行日志失败')
  } finally {
    logsLoading.value = false
  }
}

async function action(request, success) {
  try {
    const task = await request()
    activeTask.value = task
    ElMessage.success(success)
    await loadTasks()
  } catch (error) {
    ElMessage.error(error.message || '操作失败')
  }
}
async function doDispatch(row) {
  await action(() => dispatchAiTask(row.id), '任务已进入队列')
}
async function doRetry(row) {
  await action(() => retryAiTask(row.id), '已创建新的执行机会')
}
async function doApprove(row) {
  try {
    const task = row.attempts ? row : await getAiTask(row.id)
    const attempt = task.attempts?.find((item) => item.id === task.currentAttemptId) || task.attempts?.[0]
    if (!attempt?.headSha || !attempt?.diffSha) throw new Error('候选代码指纹不完整，不能批准')
    const riskText = task.riskLevel === 'high' ? '这是高风险任务，请确认你已经逐行审查关键代码。' : ''
    await ElMessageBox.confirm(
      `${riskText}\nHead: ${attempt.headSha}\nDiff: ${attempt.diffSha}\n\n批准只记录审核结论，不会自动合并或发布。`,
      '批准 AI 候选',
      { type: 'warning', confirmButtonText: '指纹一致，批准', cancelButtonText: '继续检查', dangerouslyUseHTMLString: false }
    )
    await action(
      () => approveAiTask(task.id, { headSha: attempt.headSha, diffSha: attempt.diffSha }),
      '候选已批准，请在 GitHub 完成人工合并'
    )
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '批准失败')
  }
}
async function doReject(row) {
  try {
    const { value } = await ElMessageBox.prompt('说明需要修改的地方，便于下一次重试。', '驳回候选', {
      inputType: 'textarea', inputPlaceholder: '例如：缺少并发场景测试', inputValidator: (value) => !!String(value || '').trim() || '请填写驳回原因',
      confirmButtonText: '驳回', cancelButtonText: '取消'
    })
    await action(() => rejectAiTask(row.id, { reason: value }), '候选已驳回')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '驳回失败')
  }
}
async function doCancel(row) {
  try {
    await ElMessageBox.confirm('取消后，正在运行的 Worker 会在下一次心跳时停止。', '取消 AI 任务', {
      type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '返回'
    })
    await action(() => cancelAiTask(row.id), '任务已取消')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '取消失败')
  }
}

onMounted(() => {
  loadAll(true)
  poller = setInterval(() => loadAll(false), 5000)
  document.addEventListener('visibilitychange', loadAll)
  window.addEventListener('resize', syncProjectDrawerSize)
})
onBeforeUnmount(() => {
  clearInterval(poller)
  document.removeEventListener('visibilitychange', loadAll)
  window.removeEventListener('resize', syncProjectDrawerSize)
})
</script>

<style scoped>
.ai-page {
  min-width: 0;
}
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 14px;
}
.page-head h1 {
  margin: 0 0 4px;
  color: #303133;
  font-size: 20px;
}
.page-head p {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
.head-actions,
.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.status-strip {
  display: flex;
  align-items: stretch;
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}
.status-strip button {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 128px;
  padding: 13px 16px;
  border: 0;
  border-right: 1px solid #ebeef5;
  background: transparent;
  color: #606266;
  cursor: pointer;
  font: inherit;
}
.status-strip button:hover {
  background: #f7f9fc;
}
.status-strip button b {
  color: #303133;
  font-size: 20px;
}
.status-strip button b.review { color: #e6a23c; }
.status-strip button b.failed { color: #f56c6c; }
.status-strip button b.approved { color: #67c23a; }
.capacity-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 0 16px;
  color: #909399;
  font-size: 12px;
}
.filters {
  margin-bottom: 12px;
}
.updated {
  margin-left: auto;
  color: #a8abb2;
  font-size: 12px;
}
.task-panel {
  border-radius: 8px;
}
.task-panel :deep(.el-card__body) {
  padding: 0;
}
.task-table :deep(.el-table__row) {
  cursor: pointer;
}
.task-title {
  overflow: hidden;
  color: #303133;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-sub {
  margin-top: 3px;
  overflow: hidden;
  color: #909399;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-sub.repo {
  max-width: 300px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.worker {
  color: #606266;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.validation-state,
.muted {
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
}
.error-text {
  color: #f56c6c;
}
.task-table a {
  color: #409eff;
  font-weight: 600;
  text-decoration: none;
}
.project-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.project-toolbar b,
.project-toolbar span {
  display: block;
}
.project-toolbar span {
  margin-top: 3px;
  color: #909399;
  font-size: 12px;
}
@media (max-width: 860px) {
  .status-strip {
    overflow-x: auto;
  }
  .capacity-note {
    display: none;
  }
  .status-strip button {
    min-width: 116px;
  }
}
@media (max-width: 640px) {
  .page-head {
    flex-direction: column;
  }
  .head-actions {
    width: 100%;
  }
  .head-actions .el-button {
    flex: 1;
  }
  .filters :deep(.el-select),
  .filters :deep(.el-input) {
    width: calc(50% - 4px) !important;
  }
  .updated {
    display: none;
  }
}
:global(.ai-project-drawer) {
  max-width: 100vw;
}
</style>
