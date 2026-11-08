<template>
  <div v-show="showFab" class="fab" @click="open = true" title="极速建单（快捷键 Alt+N）">
    <el-icon :size="20"><Lightning /></el-icon>
    <span>极速建单</span>
  </div>

  <el-dialog v-model="open" title="⚡ 极速建单" width="560px" class="design-quick-dialog" @open="onOpen" @closed="reset">
    <template #header="{titleId}"><div class="design-form-heading"><h2 :id="titleId" aria-label="⚡ 极速建单">快速建单</h2><p>粘贴需求，快速创建项目</p><span class="quick-lightning" aria-hidden="true"/></div></template>
    <div class="quick-design-body" data-paste-zone="极速建单">
      <label class="design-field-label">粘贴需求内容 <em>*</em></label>
      <el-input ref="textRef" v-model="text" type="textarea" :rows="5" resize="none" placeholder="例如：做个餐饮点餐小程序，要堂食和外卖，预算 5000……（直接粘贴客户消息）"/>
      <div class="quick-suggestions"><h3>快速建议 <small>（可编辑）</small></h3><div class="quick-suggestion-fields"><label><el-icon><PriceTag/></el-icon><span>报价</span><el-input-number v-model="amount" :min="0" :step="100" :controls="false"/></label><label><el-date-picker v-model="deadline" type="date" value-format="YYYY-MM-DD" placeholder="截止日期"/></label></div><DeadlineChips v-model="deadline" :clearable="false" class="qc-deadline-chips"/><p v-if="autoHint" class="qc-auto">{{ autoHint }}</p></div>
      <div class="qc-media"><label class="design-field-label">上传截图 <small>（可选）</small></label><AttachmentUploader v-model="media"/></div>
      <div class="qc-row"><span class="qc-label"><el-icon><User/></el-icon> 客户</span><el-autocomplete v-model="customer" :fetch-suggestions="suggestCustomers" :debounce="100" clearable placeholder="选填：客户名 / 旺旺号，可选以前的客户" @select="onPickCustomer"><template #default="{ item }"><span class="qc-sug-name">{{ item.value }}</span><span v-if="item.account" class="qc-sug-account">客户账号 {{ item.account }}</span></template></el-autocomplete></div>
      <!-- 选到有账号的客户：自动绑定，客户登录后就能看到这个项目（以前只有「完整建单」能绑） -->
      <p v-if="customerAccount" class="qc-bound">已绑定客户账号 <b>{{ customerAccount }}</b>，客户能在自己的页面看到这个项目<template v-if="autoOwnerName">，已按客户归属派给 {{ autoOwnerName }}</template><el-button link type="primary" size="small" @click="unbindAccount">不绑定</el-button></p>
      <div class="qc-row"><span class="qc-label"><el-icon><ChatDotRound/></el-icon> 渠道</span><el-select v-model="channel"><el-option v-for="c in CHANNEL" :key="c.value" :label="c.label" :value="c.value"/></el-select></div>
      <div v-if="isBoss && MEMBERS.length > 1" class="qc-row"><span class="qc-label"><el-icon><User/></el-icon> 派给</span><el-select v-model="ownerId"><el-option v-for="m in MEMBERS" :key="m.id" :label="m.name" :value="m.id" :disabled="m.status !== '0'"/></el-select></div>
    </div>
    <template #footer>
      <div class="qc-footer">
        <span class="qc-foot-hint">创建失败将保留已填写的内容</span>
        <el-button class="secondary-form-cancel" @click="open = false">取消</el-button>
        <el-button type="primary" :loading="submitting" aria-label="建单并派单" @click="submit">创建项目</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
defineExpose({show:()=>{open.value=true}})

import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Lightning, Promotion, MagicStick, PriceTag, User, ChatDotRound } from '@element-plus/icons-vue'
import AttachmentUploader from '@/components/AttachmentUploader.vue'
import DeadlineChips from '@/components/DeadlineChips.vue'
import { createOrder, currentMember, isBoss, orders, listCustomers } from '@/mock/store'
import { CHANNEL, MEMBERS, memberMap } from '@/constants/options'
import { parseOrderHints } from '@/utils/parse'

const props=defineProps({showFab:{type:Boolean,default:true},shortcut:{type:Boolean,default:true}})
const open = ref(false)
const text = ref('')
const media = ref([])
const amount = ref(0)
const customer = ref('')
const contact = ref('')
const customerAccount = ref('')
const autoOwnerName = ref('')
// 按客户归属自动改了「派给」时，记下原来选的人：解除绑定 / 关窗时还原，也不把自动选的人记成下次默认
const ownerBeforeAuto = ref(null)
const accounts = ref([])
const submitting = ref(false)
const deadline = ref('')
const autoHint = ref('')
// 记住上次选择
const channel = ref(localStorage.getItem('qc.channel') || 'wechat')
// 下属管理员只能建在自己名下；总管理员记住上次派给谁（那个人已不存在则默认自己）
const savedOwner = Number(localStorage.getItem('qc.owner'))
const ownerId = ref(
  isBoss.value && MEMBERS.some((m) => m.id === savedOwner) ? savedOwner : currentMember.value.id
)
const textRef = ref(null)

const ownerName = computed(() => memberMap[ownerId.value]?.name || '')
const notifyHint = computed(() => {
  if (!isBoss.value) return '建单后自动通知相关人员'
  if (ownerId.value === currentMember.value.id) return ''
  return `建单后自动通知 ${ownerName.value}`
})

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
  // 客户账号：老板看全部，员工看自己名下的；拿不到就只按以前的项目提示
  listCustomers().then((list) => { accounts.value = (list || []).filter((c) => c.status === '0') }).catch(() => {})
}
// 以前填过的客户：按最近用到的排前面，选中后把联系方式也带上
// 也把客户账号列进来：选中就自动绑定账号（account），并带上客户归属的员工（ownerId）
const knownCustomers = computed(() => {
  const byAccount = new Map(accounts.value.map((c) => [c.userName, c]))
  const byNick = new Map(accounts.value.filter((c) => c.nickName).map((c) => [c.nickName.trim(), c]))
  const seen = new Map()
  for (const o of orders) {
    const name = (o.customer || '').trim()
    if (!name) continue
    const acc = (o.customerAccount && byAccount.get(o.customerAccount)) || byNick.get(name)
    if (!seen.has(name)) seen.set(name, { value: name, contact: (o.contact || '').trim(), account: acc?.userName || '', ownerId: acc?.ownerId || null })
    else {
      const it = seen.get(name)
      if (!it.contact && o.contact) it.contact = o.contact.trim()
      if (!it.account && acc) Object.assign(it, { account: acc.userName, ownerId: acc.ownerId || null })
    }
  }
  const linked = new Set([...seen.values()].map((c) => c.account).filter(Boolean))
  for (const c of accounts.value) {
    if (linked.has(c.userName)) continue
    const name = (c.nickName || c.userName).trim()
    if (!seen.has(name)) seen.set(name, { value: name, contact: '', account: c.userName, ownerId: c.ownerId || null })
  }
  return [...seen.values()]
})
function suggestCustomers(q, cb) {
  const kw = (q || '').trim().toLowerCase()
  const list = knownCustomers.value.filter((c) => !kw || c.value.toLowerCase().includes(kw) || (c.account || '').toLowerCase().includes(kw))
  cb(list.slice(0, 8))
}
function onPickCustomer(item) {
  if (item.contact && !contact.value) contact.value = item.contact
  restoreOwner()
  customerAccount.value = item.account || ''
  // 客户有归属的员工：老板建单时默认派给 TA（和客户自己提交需求时一样）
  if (item.account && isBoss.value && item.ownerId && item.ownerId !== ownerId.value && MEMBERS.some((m) => m.id === item.ownerId && m.status === '0')) {
    ownerBeforeAuto.value = ownerId.value
    ownerId.value = item.ownerId
    autoOwnerName.value = memberMap[item.ownerId]?.name || ''
  }
}
function restoreOwner() {
  if (ownerBeforeAuto.value != null && autoOwnerName.value) ownerId.value = ownerBeforeAuto.value
  ownerBeforeAuto.value = null
  autoOwnerName.value = ''
}
function unbindAccount() {
  customerAccount.value = ''
  restoreOwner()
}
// 自动派的人被手动改掉了，就不再提示「已按客户归属派给」
watch(ownerId, (id) => {
  if (autoOwnerName.value && memberMap[id]?.name !== autoOwnerName.value) {
    autoOwnerName.value = ''
    ownerBeforeAuto.value = null
  }
})
// 改了客户名就不再是刚才选的那个账号
watch(customer, (v) => {
  if (!customerAccount.value) return
  const a = accounts.value.find((c) => c.userName === customerAccount.value)
  const names = [a?.nickName, a?.userName, ...orders.filter((o) => o.customerAccount === customerAccount.value).map((o) => o.customer)]
  if (!names.some((n) => n && n.trim() === (v || '').trim())) unbindAccount()
})

function reset() {
  text.value = ''
  customer.value = ''
  contact.value = ''
  customerAccount.value = ''
  restoreOwner()
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

async function submit() {
  if (submitting.value) return
  const title = deriveTitle()
  if (!title) {
    ElMessage.warning('粘贴点内容或加张图再建单吧')
    return
  }
  submitting.value = true
  try {
    await createOrder({
      title,
      requirement: text.value.trim(),
      attachments: [...media.value],
      channel: channel.value,
      ownerId: ownerId.value,
      status: 'pending',
      priority: 'medium',
      amount: amount.value || 0,
      deadline: deadline.value || '',
      customer: customer.value.trim(),
      contact: contact.value.trim(),
      ...(customerAccount.value ? { customerAccount: customerAccount.value } : {})
    })
  } catch (e) {
    // 没建成功：窗口和已粘贴的内容都留着，不会白贴一遍
    ElMessage.error(e.message || '建单失败，请重试')
    return
  } finally {
    submitting.value = false
  }
  // 记住本次选择
  localStorage.setItem('qc.channel', channel.value)
  localStorage.setItem('qc.owner', String(autoOwnerName.value && ownerBeforeAuto.value != null ? ownerBeforeAuto.value : ownerId.value))
  ElMessage.success(isBoss.value && ownerId.value !== currentMember.value.id ? `已建单，已派给 ${ownerName.value}，等 TA 接收` : '已建单')
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
onMounted(() => {if(props.shortcut)window.addEventListener('keydown', onKey)})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.qc-deadline-chips { margin-top: 10px; }
.qc-sug-name { margin-right: 8px; }
.qc-sug-account { font-size: 12px; color: #2f8a4f; background: #edf8f1; border-radius: 4px; padding: 1px 6px; }
.qc-bound { margin: -4px 0 10px 94px; font-size: 12px; color: #2f8a4f; line-height: 1.6; }
.qc-bound .el-button { margin-left: 6px; vertical-align: baseline; }
@media (max-width: 768px) { .qc-bound { margin-left: 0; } }

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
