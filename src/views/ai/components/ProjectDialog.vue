<template>
  <el-dialog
    :model-value="visible"
    class="ai-project-dialog"
    :title="data?.id ? '编辑代码项目' : '添加代码项目'"
    width="720px"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
    @open="fill"
  >
    <el-alert :type="form.automationMode === 'auto_deploy' ? 'warning' : 'info'" :closable="false" class="project-tip">
      {{ automationHint }}
    </el-alert>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <div class="form-grid">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="form.name" maxlength="80" placeholder="例如：接单系统后台" />
        </el-form-item>
        <el-form-item label="默认分支" prop="defaultBranch">
          <el-input v-model="form.defaultBranch" placeholder="main" />
        </el-form-item>
      </div>
      <el-form-item label="GitHub 仓库" prop="repoUrl">
        <el-input v-model="form.repoUrl" placeholder="https://github.com/org/repo.git" />
      </el-form-item>
      <div class="section-label">客户需求自动化</div>
      <div class="form-grid automation-grid">
        <el-form-item label="绑定客户项目" prop="orderId">
          <el-select v-model="form.orderId" clearable filterable placeholder="选择接单系统中的项目" style="width: 100%">
            <el-option
              v-for="order in orders"
              :key="order.id"
              :label="`${order.orderNo || `#${order.id}`} · ${order.title}`"
              :value="order.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="运行方式" prop="automationMode">
          <el-select v-model="form.automationMode" style="width: 100%">
            <el-option label="人工派单与审核" value="manual" />
            <el-option label="客户提交后自动产出 PR" value="auto_pr" />
            <el-option label="全自动部署并通知客户" value="auto_deploy" />
          </el-select>
        </el-form-item>
      </div>
      <template v-if="form.automationMode === 'auto_deploy'">
        <div class="form-grid delivery-grid">
          <el-form-item label="部署工作流" prop="deployWorkflow">
            <el-input v-model="form.deployWorkflow" placeholder="deploy.yml" />
            <span class="field-hint">仓库 .github/workflows 下的文件名</span>
          </el-form-item>
          <el-form-item label="最长等待部署">
            <el-input-number v-model="form.deployTimeoutMin" :min="5" :max="120" />
            <span class="hint">分钟</span>
          </el-form-item>
        </div>
        <el-form-item label="客户验收地址" prop="productionUrl">
          <el-input v-model="form.productionUrl" placeholder="https://客户实际访问的线上地址" />
        </el-form-item>
      </template>
      <div class="section-label">执行环境</div>
      <div class="form-grid three">
        <el-form-item label="执行器">
          <el-select v-model="form.provider" style="width: 100%">
            <el-option label="Codex" value="codex" />
            <el-option label="Claude Code" value="claude" />
            <el-option label="Hermes" value="hermes" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="模型（可留空）">
          <el-input v-model="form.model" placeholder="由 Worker 默认配置决定" />
        </el-form-item>
        <el-form-item label="Worker 配置键" prop="profileKey">
          <el-input v-model="form.profileKey" placeholder="default" />
        </el-form-item>
      </div>
      <el-form-item label="确定性验证命令" prop="validationText">
        <el-input
          v-model="form.validationText"
          type="textarea"
          :rows="4"
          placeholder="每行一条，不支持 shell 管道，例如：&#10;npm ci&#10;npm run build"
        />
      </el-form-item>
      <el-form-item label="额外禁止改动路径">
        <el-input
          v-model="form.forbiddenText"
          type="textarea"
          :rows="4"
          placeholder="每行一个 glob。系统已强制保护 CI、密钥、deploy 和 sql 目录。"
        />
      </el-form-item>
      <div class="form-grid">
        <el-form-item label="单项目最大并发">
          <el-input-number v-model="form.maxParallel" :min="1" :max="4" />
          <span class="hint">建议 1；确认机器余量后再提高</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" inline-prompt active-text="启用" inactive-text="停用" />
        </el-form-item>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存项目</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  visible: Boolean,
  data: Object,
  saving: Boolean,
  orders: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:visible', 'submit'])
const formRef = ref()
const initial = () => ({
  id: null,
  version: null,
  name: '',
  repoUrl: '',
  defaultBranch: 'main',
  provider: 'codex',
  model: '',
  profileKey: 'default',
  orderId: null,
  automationMode: 'manual',
  deployWorkflow: 'deploy.yml',
  deployTimeoutMin: 20,
  productionUrl: '',
  validationText: '',
  forbiddenText: '',
  maxParallel: 1,
  enabled: true
})
const form = reactive(initial())
const rules = {
  name: [{ required: true, message: '请填写项目名称', trigger: 'blur' }],
  repoUrl: [
    { required: true, message: '请填写 GitHub 仓库', trigger: 'blur' },
    { pattern: /^(https:\/\/github\.com\/|git@github\.com:)[^/]+\/[^/]+(?:\.git)?$/, message: '只支持不含凭证的 GitHub 仓库地址', trigger: 'blur' }
  ],
  defaultBranch: [{ required: true, message: '请填写默认分支', trigger: 'blur' }],
  profileKey: [{ required: true, message: '请填写 Worker 配置键', trigger: 'blur' }],
  validationText: [{ required: true, message: '至少配置一条构建或测试命令', trigger: 'blur' }],
  orderId: [{
    validator: (_rule, value, callback) => {
      if (form.automationMode !== 'manual' && !value) callback(new Error('自动模式必须绑定客户项目'))
      else callback()
    }, trigger: 'change'
  }],
  deployWorkflow: [{
    validator: (_rule, value, callback) => {
      if (form.automationMode === 'auto_deploy' && (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.ya?ml$/.test(value || '') || String(value).includes('..'))) callback(new Error('请填写仓库内的 yml/yaml 工作流文件名'))
      else callback()
    }, trigger: 'blur'
  }],
  productionUrl: [{
    validator: (_rule, value, callback) => {
      if (form.automationMode === 'auto_deploy' && !/^https?:\/\/\S+$/.test(value || '')) callback(new Error('请填写客户可访问的 http/https 地址'))
      else callback()
    }, trigger: 'blur'
  }]
}

const automationHint = computed(() => ({
  manual: '人工模式保留现有流程。GitHub 和模型密钥始终只放在 Worker 环境变量中。',
  auto_pr: '客户提交或追加 Bug 后会自动改码、验证并创建 PR，部署前仍需人工处理。',
  auto_deploy: '验证通过后将自动合并、等待部署成功并通知客户。失败任务会进入异常队列。'
}[form.automationMode]))

function lines(value) {
  if (Array.isArray(value)) return value.join('\n')
  return value || ''
}
function array(value) {
  return [...new Set(String(value || '').split('\n').map((item) => item.trim()).filter(Boolean))]
}
function fill() {
  const data = props.data || {}
  Object.assign(form, initial(), data, {
    enabled: Number(data.enabled ?? 1) === 1,
    validationText: lines(data.validationCommands),
    forbiddenText: lines(data.forbiddenPaths)
  })
  formRef.value?.clearValidate()
}
async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  emit('submit', {
    id: form.id || undefined,
    version: form.version || undefined,
    name: form.name,
    repoUrl: form.repoUrl,
    defaultBranch: form.defaultBranch,
    provider: form.provider,
    model: form.model,
    profileKey: form.profileKey,
    orderId: form.orderId || null,
    automationMode: form.automationMode,
    deployWorkflow: form.deployWorkflow,
    deployTimeoutMin: form.deployTimeoutMin,
    productionUrl: form.productionUrl,
    validationCommands: array(form.validationText),
    forbiddenPaths: array(form.forbiddenText),
    maxParallel: form.maxParallel,
    enabled: form.enabled
  })
}
</script>

<style scoped>
.project-tip {
  margin-bottom: 18px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-grid.three {
  grid-template-columns: 0.8fr 1fr 1fr;
}
.section-label {
  margin: 20px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
  color: #303133;
  font-size: 13px;
  font-weight: 700;
}
.field-hint {
  display: block;
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
.hint {
  margin-left: 10px;
  color: #909399;
  font-size: 12px;
}
@media (max-width: 680px) {
  .form-grid,
  .form-grid.three {
    grid-template-columns: 1fr;
    gap: 0;
  }
  :global(.ai-project-dialog) {
    width: calc(100vw - 24px) !important;
  }
}
</style>
