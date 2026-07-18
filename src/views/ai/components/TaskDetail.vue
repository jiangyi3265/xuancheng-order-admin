<template>
  <el-drawer
    :model-value="visible"
    class="ai-task-drawer"
    :size="drawerSize"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
    @open="$emit('refresh')"
  >
    <template #header>
      <div class="drawer-head">
        <div>
          <div class="eyebrow">AI TASK #{{ task?.id || '-' }}</div>
          <h2>{{ task?.title || '任务详情' }}</h2>
        </div>
        <el-tag v-if="task" :type="TASK_STATUS[task.status]?.type" effect="light">
          {{ TASK_STATUS[task.status]?.label || task.status }}
        </el-tag>
      </div>
    </template>

    <div v-loading="loading" class="detail-body">
      <template v-if="task">
        <div class="action-row">
          <el-button v-if="task.status === 'draft'" type="primary" @click="$emit('dispatch', task)">进入队列</el-button>
          <el-button v-if="['failed', 'rejected', 'delivery_failed'].includes(task.status)" type="primary" @click="$emit('retry', task)">重新执行</el-button>
          <el-button v-if="task.status === 'awaiting_review'" type="success" @click="$emit('approve', task)">批准候选</el-button>
          <el-button v-if="task.status === 'awaiting_review'" type="danger" plain @click="$emit('reject', task)">驳回</el-button>
          <el-button
            v-if="['draft', 'queued', 'claimed', 'running', 'awaiting_review', 'failed', 'rejected', 'delivery_failed'].includes(task.status)"
            plain
            @click="$emit('cancel', task)"
          >取消任务</el-button>
          <el-button :icon="Refresh" text @click="$emit('refresh')">刷新</el-button>
        </div>

        <el-alert v-if="task.status === 'awaiting_review'" type="warning" :closable="false" class="review-tip">
          批准前请先打开 PR 审代码，并确认 Head 与 Diff 指纹未变化。批准不会自动合并或发布。
        </el-alert>
        <el-alert v-if="task.status === 'delivery_failed'" type="error" :closable="false" class="review-tip">
          自动改码已产出候选，但合并或部署没有完成：{{ task.deliveryError || '请检查部署记录和 Worker 日志。' }}
        </el-alert>
        <el-alert v-if="task.status === 'delivered'" type="success" :closable="false" class="review-tip">
          修改已通过验证、完成部署并同步给客户。
        </el-alert>

        <el-descriptions :column="2" border class="meta">
          <el-descriptions-item label="代码项目">{{ task.projectName }}</el-descriptions-item>
          <el-descriptions-item label="风险">
            <el-tag size="small" :type="RISK[task.riskLevel]?.type">{{ RISK[task.riskLevel]?.label || task.riskLevel }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="订单 / Bug">{{ task.orderId || '-' }} / {{ task.bugId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ sourceLabel(task.sourceType) }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ task.createdBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(task.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(task.updateTime) }}</el-descriptions-item>
        </el-descriptions>

        <section v-if="task.deploymentUrl || task.deliveryUrl" class="section delivery-section">
          <div class="section-head"><h3>自动交付</h3><span class="hash">{{ shortSha(task.mergedSha) }}</span></div>
          <div class="delivery-links">
            <a v-if="task.deploymentUrl" :href="task.deploymentUrl" target="_blank" rel="noopener noreferrer">查看部署 Action</a>
            <a v-if="task.deliveryUrl" :href="task.deliveryUrl" target="_blank" rel="noopener noreferrer">打开客户验收地址</a>
            <span v-if="task.deliveredAt">{{ formatTime(task.deliveredAt) }}</span>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <h3>改码说明</h3>
            <span class="hash">Prompt {{ shortSha(task.promptHash) }}</span>
          </div>
          <pre class="prompt">{{ task.prompt }}</pre>
        </section>

        <section v-if="currentAttempt" class="section">
          <div class="section-head">
            <h3>当前候选证据</h3>
            <el-tag size="small" :type="ATTEMPT_STATUS[currentAttempt.status]?.type">
              Attempt {{ currentAttempt.attemptNo }} · {{ ATTEMPT_STATUS[currentAttempt.status]?.label || currentAttempt.status }}
            </el-tag>
          </div>
          <div class="evidence-grid">
            <div><span>Worker</span><b>{{ currentAttempt.workerId || '-' }}</b></div>
            <div><span>分支</span><code>{{ currentAttempt.branchName || '-' }}</code></div>
            <div><span>Base</span><code :title="currentAttempt.baseSha">{{ shortSha(currentAttempt.baseSha) }}</code></div>
            <div><span>Head</span><code :title="currentAttempt.headSha">{{ shortSha(currentAttempt.headSha) }}</code></div>
            <div><span>Diff</span><code :title="currentAttempt.diffSha">{{ shortSha(currentAttempt.diffSha) }}</code></div>
            <div><span>验证</span><b>{{ Number(currentAttempt.validationPassed) === 1 ? '通过' : '未通过 / 未完成' }}</b></div>
          </div>
          <div v-if="currentAttempt.prUrl" class="pr-row">
            <a :href="currentAttempt.prUrl" target="_blank" rel="noopener noreferrer">在 GitHub 打开 Pull Request</a>
            <el-button size="small" :icon="CopyDocument" @click="copyEvidence">复制审核指纹</el-button>
          </div>
          <el-alert v-if="currentAttempt.errorMessage" type="error" :closable="false" class="attempt-error">
            {{ currentAttempt.errorMessage }}
          </el-alert>
          <pre v-if="currentAttempt.validationSummary" class="validation">{{ currentAttempt.validationSummary }}</pre>
        </section>

        <el-tabs v-model="tab" class="records">
          <el-tab-pane label="执行记录" name="attempts">
            <el-table :data="task.attempts || []" size="small" stripe>
              <el-table-column prop="attemptNo" label="#" width="54" />
              <el-table-column label="状态" width="110">
                <template #default="{ row }">
                  <el-tag size="small" :type="ATTEMPT_STATUS[row.status]?.type">
                    {{ ATTEMPT_STATUS[row.status]?.label || row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="workerId" label="Worker" min-width="120" show-overflow-tooltip />
              <el-table-column label="开始" min-width="150">
                <template #default="{ row }">{{ formatTime(row.startedAt || row.createTime) }}</template>
              </el-table-column>
              <el-table-column label="结果" min-width="170" show-overflow-tooltip>
                <template #default="{ row }">{{ row.errorMessage || row.validationSummary || '-' }}</template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`运行日志${logs.length ? ` (${logs.length})` : ''}`" name="logs">
            <div class="log-tools">
              <span>当前 Attempt 的最近日志</span>
              <el-button size="small" :loading="logsLoading" @click="$emit('load-logs')">刷新日志</el-button>
            </div>
            <div v-if="logs.length" class="logs thin-scroll">
              <div v-for="item in logs" :key="item.seq" class="log-line">
                <span>{{ item.seq }}</span><time>{{ formatTime(item.createTime) }}</time><code>{{ item.message }}</code>
              </div>
            </div>
            <el-empty v-else description="还没有上传运行日志" :image-size="72" />
          </el-tab-pane>
          <el-tab-pane label="审计事件" name="events">
            <el-timeline class="events">
              <el-timeline-item
                v-for="item in task.events || []"
                :key="item.id"
                :timestamp="formatTime(item.createTime)"
                placement="top"
              >
                <b>{{ eventLabel(item.eventType) }}</b>
                <span>{{ item.actorId }}</span>
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Refresh } from '@element-plus/icons-vue'
import { ATTEMPT_STATUS, RISK, TASK_STATUS, formatTime, shortSha } from '../options'

const props = defineProps({
  visible: Boolean,
  task: Object,
  loading: Boolean,
  logs: { type: Array, default: () => [] },
  logsLoading: Boolean
})
defineEmits([
  'update:visible', 'refresh', 'dispatch', 'retry', 'approve', 'reject', 'cancel', 'load-logs'
])
const tab = ref('attempts')
const drawerSize = ref(window.innerWidth <= 900 ? '100vw' : '860px')
const syncDrawerSize = () => { drawerSize.value = window.innerWidth <= 900 ? '100vw' : '860px' }
const currentAttempt = computed(() => {
  if (!props.task?.attempts?.length) return null
  return props.task.attempts.find((item) => item.id === props.task.currentAttemptId) || props.task.attempts[0]
})

function eventLabel(value) {
  const labels = {
    'task.created': '创建任务',
    'task.dispatched': '进入队列',
    'task.retried': '重新执行',
    'task.cancelled': '取消任务',
    'task.auto_created': '客户需求自动入队',
    'task.auto_retried': '失败后自动重试',
    'attempt.claimed': 'Worker 认领',
    'attempt.succeeded': '产出候选 PR',
    'attempt.failed': '执行失败',
    'attempt.expired': '租约过期并回队列',
    'review.approved': '人工批准',
    'review.rejected': '人工驳回',
    'delivery.succeeded': '部署成功并通知客户',
    'delivery.failed': '自动交付异常'
  }
  return labels[value] || value
}

function sourceLabel(value) {
  return {
    manual: '后台手动创建',
    customer_bug: '客户提交 Bug',
    customer_bug_update: '客户追加说明'
  }[value] || value || '-'
}

async function copyEvidence() {
  const attempt = currentAttempt.value
  const text = `Head: ${attempt?.headSha || '-'}\nDiff: ${attempt?.diffSha || '-'}\nPR: ${attempt?.prUrl || '-'}`
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('审核指纹已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选择')
  }
}
onMounted(() => window.addEventListener('resize', syncDrawerSize))
onBeforeUnmount(() => window.removeEventListener('resize', syncDrawerSize))
</script>

<style scoped>
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.drawer-head h2 {
  margin: 2px 0 0;
  color: #303133;
  font-size: 20px;
}
.eyebrow {
  color: #909399;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.detail-body {
  min-height: 320px;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.review-tip {
  margin-bottom: 14px;
}
.meta {
  margin-bottom: 18px;
}
.section {
  margin: 18px 0;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.section h3 {
  margin: 0;
  color: #303133;
  font-size: 15px;
}
.hash {
  color: #909399;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.prompt,
.validation {
  margin: 0;
  padding: 12px 14px;
  overflow: auto;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafafa;
  color: #303133;
  font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}
.evidence-grid > div {
  min-width: 0;
  padding: 10px 12px;
  border-right: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
}
.evidence-grid > div:nth-child(3n) {
  border-right: 0;
}
.evidence-grid > div:nth-last-child(-n + 3) {
  border-bottom: 0;
}
.evidence-grid span {
  display: block;
  margin-bottom: 4px;
  color: #909399;
  font-size: 11px;
}
.evidence-grid b,
.evidence-grid code {
  display: block;
  overflow: hidden;
  color: #303133;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}
.pr-row a {
  color: #409eff;
  font-weight: 600;
  text-decoration: none;
}
.delivery-section {
  padding: 12px 14px;
  border: 1px solid #d9ecff;
  border-radius: 6px;
  background: #f5f9ff;
}
.delivery-links {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.delivery-links a {
  color: #409eff;
  font-weight: 600;
  text-decoration: none;
}
.delivery-links span {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}
.attempt-error {
  margin-top: 10px;
}
.validation {
  margin-top: 10px;
  max-height: 220px;
}
.records {
  margin-top: 24px;
}
.log-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #606266;
  font-size: 13px;
}
.logs {
  max-height: 360px;
  overflow: auto;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #1f2329;
}
.log-line {
  display: grid;
  grid-template-columns: 44px 148px minmax(0, 1fr);
  gap: 10px;
  padding: 5px 10px;
  border-bottom: 1px solid #30363d;
  color: #d8dee9;
  font-size: 12px;
}
.log-line > span,
.log-line time {
  color: #8b949e;
}
.log-line code {
  white-space: pre-wrap;
  word-break: break-word;
}
.events span {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
@media (max-width: 680px) {
  .evidence-grid {
    grid-template-columns: 1fr 1fr;
  }
  .evidence-grid > div,
  .evidence-grid > div:nth-child(3n),
  .evidence-grid > div:nth-last-child(-n + 3) {
    border-right: 1px solid #ebeef5;
    border-bottom: 1px solid #ebeef5;
  }
  .evidence-grid > div:nth-child(2n) {
    border-right: 0;
  }
  .evidence-grid > div:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
  .log-line {
    grid-template-columns: 34px minmax(0, 1fr);
  }
  .log-line time {
    display: none;
  }
}
:global(.ai-task-drawer) {
  max-width: 100vw;
}
</style>
