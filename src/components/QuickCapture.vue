<template>
  <div class="fab" @click="open = true" title="极速建单（快捷键 Alt+N）">
    <el-icon :size="20"><Lightning /></el-icon>
    <span>极速建单</span>
  </div>

  <el-dialog v-model="open" title="⚡ 极速建单" width="560px" @open="onOpen" @closed="reset">
    <div class="qc-tip">
      把客户的需求整段粘进来（<b>Ctrl+V</b>），第一行自动作为项目名；截图直接 Ctrl+V，视频 / 文件 / 压缩包点 + 或拖拽上传。其余信息事后补。
    </div>

    <el-input
      ref="textRef"
      v-model="text"
      type="textarea"
      :rows="5"
      resize="none"
      placeholder="例如：做个餐饮点餐小程序，要堂食和外卖，预算 5000……（直接粘贴客户消息）"
    />

    <div class="qc-media">
      <AttachmentUploader v-model="media" />
    </div>

    <div class="qc-row">
      <span class="qc-label">报价</span>
      <el-input-number v-model="amount" :min="0" :step="100" controls-position="right" style="width: 150px" />
      <span v-if="autoHint" class="qc-auto"><el-icon><MagicStick /></el-icon> {{ autoHint }}</span>
    </div>

    <div class="qc-row">
      <span class="qc-label">截止</span>
      <DeadlineChips v-model="deadline" />
    </div>

    <div class="qc-row">
      <span class="qc-label">来源</span>
      <div class="qc-chips">
        <span
          v-for="c in CHANNEL"
          :key="c.value"
          class="chip"
          :class="{ on: channel === c.value }"
          :style="channel === c.value ? { color: c.color, borderColor: c.color } : {}"
          @click="channel = c.value"
        >{{ c.label }}</span>
      </div>
    </div>

    <div class="qc-row">
      <span class="qc-label">派给</span>
      <el-radio-group v-model="ownerId">
        <el-radio-button v-for="m in MEMBERS" :key="m.id" :value="m.id">
          {{ m.name }}（{{ m.roleLabel }}）
        </el-radio-button>
      </el-radio-group>
    </div>

    <template #footer>
      <div class="qc-footer">
        <span class="qc-foot-hint">建单后自动通知 {{ ownerName }} · Ctrl+Enter 提交</span>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :icon="Promotion" @click="submit">建单并派单</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Lightning, Promotion, MagicStick } from '@element-plus/icons-vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import DeadlineChips from '@/components/DeadlineChips.vue'
import { createOrder } from '@/mock/store'
import { CHANNEL, MEMBERS, EMP_ID, memberMap } from '@/constants/options'
import { parseOrderHints } from '@/utils/parse'

const open = ref(false)
const text = ref('')
const media = ref([])
const amount = ref(0)
const deadline = ref('')
const autoHint = ref('')
// 记住上次选择
const channel = ref(localStorage.getItem('qc.channel') || 'wechat')
const ownerId = ref(Number(localStorage.getItem('qc.owner')) || EMP_ID)
const textRef = ref(null)

const ownerName = computed(() => memberMap[ownerId.value]?.name || '')

// 粘贴/输入文本时，智能识别报价与截止（仅在用户未手动填时）
watch(text, (val) => {
  const h = parseOrderHints(val)
  const hits = []
  if (h.amount != null && !amount.value) { amount.value = h.amount; hits.push('报价 ¥' + h.amount) }
  if (h.deadline && !deadline.value) { deadline.value = h.deadline; hits.push('截止 ' + h.deadline) }
  if (hits.length) autoHint.value = '已识别：' + hits.join('、')
})

function onOpen() {
  nextTick(() => textRef.value?.focus())
}
function reset() {
  text.value = ''
  media.value = []
  amount.value = 0
  deadline.value = ''
  autoHint.value = ''
  // 保留 channel / ownerId（记住上次）
}

function deriveTitle() {
  const firstLine = (text.value || '').split('\n').map((s) => s.trim()).find((s) => s)
  if (firstLine) return firstLine.length > 30 ? firstLine.slice(0, 30) + '…' : firstLine
  if (media.value.length) return '图片/视频需求'
  return ''
}

function submit() {
  const title = deriveTitle()
  if (!title) {
    ElMessage.warning('粘贴点内容或加张图再建单吧')
    return
  }
  createOrder({
    title,
    requirement: text.value.trim(),
    attachments: [...media.value],
    channel: channel.value,
    ownerId: ownerId.value,
    status: 'pending',
    priority: 'medium',
    amount: amount.value || 0,
    deadline: deadline.value || '',
    customer: '',
    contact: ''
  })
  // 记住本次选择
  localStorage.setItem('qc.channel', channel.value)
  localStorage.setItem('qc.owner', String(ownerId.value))
  ElMessage.success(`已建单，并通知 ${ownerName.value}`)
  open.value = false
}

function onKey(e) {
  if (e.altKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault()
    open.value = true
  } else if (open.value && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px;
  background: #409eff;
  color: #fff;
  border-radius: 28px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.45);
  transition: transform 0.15s, box-shadow 0.15s;
}
.fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(64, 158, 255, 0.55);
}
.qc-tip {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
  margin-bottom: 12px;
}
.qc-tip b {
  color: #409eff;
}
.qc-media {
  margin: 14px 0;
}
.qc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.qc-label {
  font-size: 14px;
  color: #606266;
  width: 40px;
  flex-shrink: 0;
}
.qc-auto {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 10px;
  font-size: 12px;
  color: #67c23a;
}
.qc-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.chip {
  padding: 4px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 16px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: all 0.15s;
}
.chip.on {
  background: #ecf5ff;
  font-weight: 600;
}
.qc-footer {
  display: flex;
  align-items: center;
}
.qc-foot-hint {
  font-size: 12px;
  color: #909399;
  margin-right: auto;
}
</style>
