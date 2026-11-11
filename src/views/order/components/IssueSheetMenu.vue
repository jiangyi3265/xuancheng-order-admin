<template>
  <div class="sheet-menu">
    <span :title="count ? '复制全部 ' + count + ' 条待处理需求及其附件' : '没有待处理的问题'">
      <el-button class="copy-sheet" size="small" :disabled="!count" @click="copySheet">复制给 AI</el-button>
    </span>
    <el-dropdown trigger="click" @command="choose">
      <el-button class="sheet-more" size="small" :icon="ArrowDown" aria-label="AI 任务单选项" />
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="copy" :disabled="!count">复制任务单</el-dropdown-item>
          <el-dropdown-item command="link">AI 链接</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <el-dialog v-if="open" v-model="open" title="AI 链接" width="min(440px, 94vw)"
      append-to-body destroy-on-close :close-on-click-modal="false" :show-close="!saving" :close-on-press-escape="!saving">
      <div class="sheet-link-dialog">
        <strong>{{ project.title }}</strong>
        <p><b>待处理 {{ count }} 条</b>（未标记、需处理）。把一个链接发给 Codex，就能按需求编号查看每条的原图、补充说明和附件。新需求也会显示在同一链接里。</p>
        <p class="sheet-note">持有链接即可查看，无需登录。</p>
        <p v-if="loading && !info" role="status">正在读取链接状态…</p>
        <div v-if="error" class="sheet-error" role="alert">
          {{ error }} <el-button link type="primary" :disabled="loading || saving" @click="refresh">重试</el-button>
        </div>
        <dl v-if="info">
          <div><dt>链接状态</dt><dd>{{ stateText[info.state] }}</dd></div>
          <div v-if="info.expiresAt"><dt>到期时间</dt><dd>{{ info.expiresAt }}</dd></div>
          <div v-if="info.state !== 'none'"><dt>上次读取</dt><dd>{{ info.lastReadAt || '尚未读取' }}</dd></div>
        </dl>
        <div v-if="freshUrl" class="sheet-url">
          <label for="new-issue-sheet-url">关闭前请复制并保存链接</label>
          <input id="new-issue-sheet-url" :value="freshUrl" readonly @focus="$event.target.select()">
          <el-button size="small" type="primary" :disabled="saving || verifying" :loading="verifying" @click="copyLink">复制链接</el-button>
          <a class="sheet-preview" :href="freshUrl" target="_blank" rel="noopener noreferrer">打开预览，查看问题和图片</a>
        </div>
        <p v-else-if="info?.state === 'active'" class="sheet-note">链接仅在生成时显示。若遗失，可重新生成。</p>
        <section v-if="isBoss && info?.state === 'active'" class="reply-access">
          <strong>Codex 回复权限</strong>
          <p>仅用于这个项目。每条回复须写明修改内容和测试结果，提交后等你验收。</p>
          <label>同步查看回复 <el-select v-model="readerId" :disabled="saving || verifying" clearable placeholder="仅项目负责人和管理员">
            <el-option v-for="m in MEMBERS" :key="m.id" :label="m.name" :value="m.id"/>
          </el-select></label>
          <el-button v-if="info.replyRevision && (readerId || null) !== info.replyReaderId" size="small" :disabled="saving || verifying" @click="saveReader">保存查看人</el-button>
          <el-button size="small" :disabled="saving || verifying" @click="manageKey(true)">{{ info.replyRevision ? '更换回复凭据' : '开启回复权限' }}</el-button>
          <el-button v-if="info.replyRevision" size="small" :disabled="saving || verifying" @click="manageKey(false)">关闭回复权限</el-button>
          <el-button v-if="secret" :disabled="saving || verifying" size="small" type="primary" @click="copyInstructions">复制 Codex 回复说明</el-button>
          <p v-if="secret">请在关闭前复制，回复凭据只显示一次。</p>
        </section>
      </div>
      <template #footer>
        <div class="sheet-footer">
          <el-button v-if="info?.state === 'active'" type="danger" plain :disabled="saving || verifying" @click="change('disable')">停用</el-button>
          <el-button v-if="info" type="primary" :disabled="saving || verifying" :loading="saving"
            @click="change(info.state === 'none' ? 'generate' : 'regenerate')">
            {{ info.state === 'none' ? '生成链接' : '重新生成' }}
          </el-button>
          <el-button :disabled="saving" @click="open = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { copyText } from '@/utils/customerNudge'
import { toast } from '@/utils/toast'
import { issueSheet, sheetIssues } from '@/utils/issueSheet'
import { MEMBERS } from '@/constants/options'
import { adminHttp, isBoss } from '@/mock/store'

const props = defineProps({ project: { type: Object, required: true } })
const count = computed(() => sheetIssues(props.project.bugs).length)
const stateText = { none: '尚未生成', active: '有效', disabled: '已停用', expired: '已到期' }
const open = ref(false)
const saving = ref(false)
const loading = ref(false)
const verifying = ref(false)
const freshUrl = ref('')
const readerId = ref(null)
const secret = ref('')
const error = ref('')
const info = ref(null)
let generation = 0
let poll

function choose(command) {
  if (command === 'copy') copySheet()
  if (command === 'link') open.value = true
}

function copySheet() {
  if (count.value) copyText(issueSheet(props.project, props.project.sheetOrigin || location.origin),
    '已复制 ' + count.value + ' 条问题，粘给 Codex / Claude 就行')
}
function getStatus() {
  return adminHttp('/jiedan/agent/orders/' + props.project.id + '/link', { cache: 'no-store' })
}
async function copyLink() {
  if (!freshUrl.value || saving.value || verifying.value) return
  // 另一个账号可能在上次轮询后已经换链。复制之前检查这一代链接仍有效。
  const ticket = ++generation
  verifying.value = true
  loading.value = false
  try {
    const data = await getStatus()
    if (ticket !== generation) return
    acceptStatus(data)
    error.value = ''
    if (freshUrl.value) await copyText(freshUrl.value, '已复制 AI 链接')
    else toast.info('链接已变更，请查看当前状态')
  } catch (e) {
    if (ticket === generation) clearUnverified(e)
  } finally {
    if (ticket === generation) verifying.value = false
  }
}

function clearUnverified(e) {
  secret.value = ''
  info.value = null
  freshUrl.value = ''
  error.value = e.message
}

function acceptStatus(data) {
  if (!data || !Object.prototype.hasOwnProperty.call(stateText, data.state) ||
      (data.state === 'active' && !data.revision)) throw new Error('暂时无法读取链接状态')
  if (info.value?.revision !== data.revision || data.state !== 'active') freshUrl.value = ''
  if (info.value?.replyRevision !== data.replyRevision || data.state !== 'active') secret.value = ''
  const savedReader = data.replyReaderId ?? null
  if (data.replyRevision && (!info.value || info.value.replyRevision !== data.replyRevision || info.value.replyReaderId !== savedReader)) readerId.value = savedReader
  info.value = { replyReaderId:savedReader, replyRevision:data.replyRevision, state: data.state, revision: data.revision, expiresAt: data.expiresAt, lastReadAt: data.lastReadAt }
}

async function refresh() {
  if (!open.value || saving.value || loading.value || verifying.value) return
  const ticket = generation
  loading.value = true
  try {
    const data = await getStatus()
    if (ticket === generation) { acceptStatus(data); error.value = '' }
  } catch (e) {
    if (ticket === generation) clearUnverified(e)
  } finally {
    if (ticket === generation) loading.value = false
  }
}

async function change(action) {
  if (!open.value || saving.value || verifying.value || !info.value) return
  const ticket = ++generation
  saving.value = true
  loading.value = false
  try {
    if (info.value.state === 'active') {
      const message = action === 'disable' ? '停用后，已保存的链接和回复凭据将立即失效。' : '重新生成后，旧链接和回复凭据将立即失效。请复制新链接，并重新开启回复权限。'
      try { await ElMessageBox.confirm(message, action === 'disable' ? '停用 AI 链接' : '重新生成 AI 链接', { confirmButtonText: '确定', cancelButtonText: '取消' }) }
      catch { return }
    }
    if (ticket !== generation) return
    const data = await adminHttp('/jiedan/agent/orders/' + props.project.id + '/link/' + action, { method: 'POST', cache: 'no-store' })
    if (ticket !== generation) return
    acceptStatus(data)
    freshUrl.value = data.url || ''
    error.value = ''
  } catch (e) {
    if (ticket === generation) clearUnverified(e)
  } finally {
    if (ticket === generation) saving.value = false
  }
}

async function manageKey(enable) {
  if (saving.value || verifying.value || !open.value) return
  const ticket = ++generation
  saving.value = true
  loading.value = false
  try {
    if (info.value?.replyRevision) {
      try { await ElMessageBox.confirm('操作后原回复凭据立即失效。', enable ? '更换回复凭据' : '关闭回复权限') }
      catch { return }
    }
    if (ticket !== generation) return
    const result = await adminHttp('/jiedan/agent/orders/' + props.project.id + '/reply-key/' + (enable ? 'enable' : 'disable') + (enable && readerId.value ? '?readerId='+encodeURIComponent(readerId.value) : ''), {method:'POST'})
    if (ticket !== generation) return
    secret.value = ''
    const data = await getStatus()
    if (ticket !== generation) return
    acceptStatus(data)
    secret.value = data.state === 'active' && result.replyRevision === data.replyRevision ? result.secret || '' : ''
    error.value = ''
  } catch (e) {
    if (ticket === generation) clearUnverified(e)
  } finally { if (ticket === generation) saving.value = false }
}
async function saveReader() {
  if (saving.value || verifying.value || !info.value?.replyRevision) return
  const ticket = ++generation
  saving.value = true
  loading.value = false
  try {
    const reader = readerId.value
    const path = '/jiedan/agent/orders/' + props.project.id + '/reply-reader'
    const data = await adminHttp(path + (reader ? '?readerId=' + encodeURIComponent(reader) : ''), {method:'POST'})
    if (ticket !== generation) return
    acceptStatus(data)
    error.value = ''
    toast.success('已保存查看人')
  } catch (e) {
    if (ticket === generation) clearUnverified(e)
  } finally { if (ticket === generation) saving.value = false }
}
async function copyInstructions() {
  if (!secret.value || saving.value || verifying.value) return
  const ticket = ++generation
  verifying.value = true
  loading.value = false
  try {
    const data = await getStatus()
    if (ticket !== generation) return
    acceptStatus(data)
    if (!secret.value) { toast.info('回复凭据已变更'); return }
    await copyVerifiedInstructions()
  } catch (e) {
    if (ticket === generation) clearUnverified(e)
  } finally { if (ticket === generation) verifying.value = false }
}
function copyVerifiedInstructions() {
  const origin = location.origin
  const source = freshUrl.value || '使用我提供的本项目只读清单'
  return copyText([source, '逐条完成实际修改和测试后，用对应需求编号提交一次结果。',
    'POST ' + origin + '/jiedan/agent/issue-reports/{需求编号}',
    '请求头 Content-Type: application/json',
    '请求头 X-Codex-Reply-Key: ' + secret.value,
    'JSON 正文 {"requestId":"每次报告使用新UUID，重试沿用","changes":"实际修改内容","tests":"实际测试方法和结果"}',
    '成功以响应 JSON 的 code=200 为准。不要把回复凭据写入代码、提交记录或回复正文。'].join('\n'), '回复说明已复制')
}
function reset() {
  readerId.value = MEMBERS.find(m=>m.name==='费鹏飞')?.id || null
  secret.value = ''
  generation++
  clearInterval(poll)
  freshUrl.value = ''
  info.value = null
  error.value = ''
  saving.value = false
  verifying.value = false
  loading.value = false
}
watch(open, value => {
  reset()
  if (value) {
    refresh()
    poll = setInterval(() => { if (!document.hidden) refresh() }, 4000)
  }
}, { flush: 'sync' })
onBeforeUnmount(reset)
</script>

<style scoped>
.sheet-menu { display: inline-flex; align-items: stretch; white-space: nowrap; }
.sheet-menu .copy-sheet { border-radius: 6px 0 0 6px; }
.sheet-menu .sheet-more { margin-left: -1px; border-radius: 0 6px 6px 0; padding-inline: 5px; }
.sheet-link-dialog { max-height: 62vh; max-height: 62dvh; overflow-y: auto; overflow-wrap: anywhere; }
.sheet-link-dialog p { margin: 8px 0 14px; line-height: 1.55; color: var(--el-text-color-regular); }
.sheet-link-dialog dl { margin: 12px 0; padding: 10px 14px; background: var(--el-fill-color-lighter); border-radius: 8px; }
.sheet-link-dialog dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; padding: 4px 0; }
.sheet-link-dialog dd { margin: 0; text-align: right; }
.sheet-link-dialog dt, .sheet-note { color: var(--el-text-color-secondary); }
.sheet-error { color: var(--el-color-danger); }
.sheet-url { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 7px; align-items: center; }
.sheet-url label { grid-column: 1/-1; }
.sheet-preview { grid-column: 1/-1; justify-self: start; color: var(--el-color-primary); }
.sheet-url input { width: 100%; box-sizing: border-box; min-width: 0; padding: 7px; font: inherit; border-radius: 6px; border: 1px solid var(--el-border-color); }
.sheet-footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.sheet-footer .el-button { margin-left: 0; }
</style>
