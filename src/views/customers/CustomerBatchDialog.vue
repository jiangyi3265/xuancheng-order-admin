<template>
  <el-dialog :model-value="visible" title="批量创建客户账号" width="460px" append-to-body
    :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @close="close">
    <template v-if="!accounts.length">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="创建人数">
          <el-input-number :model-value="names.length || count" aria-label="创建人数" :min="1" :max="50"
            :disabled="!!names.length || busy" @update:model-value="count = $event" />
        </el-form-item>
        <el-form-item label="测试人姓名（选填）">
          <el-input v-model="text" type="textarea" :rows="3" :disabled="busy"
            placeholder="每行一个姓名，人数会自动计算" />
        </el-form-item>
      </el-form>
      <p class="batch-hint">用户名自动生成 8 位，初始密码统一为 <strong>123456</strong>。</p>
      <p v-if="projectHint" class="batch-hint">{{ projectHint }}</p>
    </template>
    <template v-else>
      <p role="status">已创建 {{ accounts.length }} 个账号，初始密码 <strong>123456</strong>。</p>
      <p v-if="projectHint" class="batch-hint">已选入项目表单，点「保存项目」完成绑定。</p>
      <ul class="batch-results">
        <li v-for="item in accounts" :key="item.userId">
          <span><strong v-if="item.nickName !== item.userName">{{ item.nickName }}</strong><code>{{ item.userName }}</code></span>
          <el-button link type="primary" @click="copy([item])">复制</el-button>
        </li>
      </ul>
    </template>
    <p v-if="error" class="batch-error" role="alert">{{ error }}</p>
    <template #footer>
      <template v-if="accounts.length">
        <el-button @click="copy(accounts)">复制全部</el-button>
        <el-button type="primary" @click="close">完成</el-button>
      </template>
      <template v-else>
        <el-button :disabled="busy" @click="close">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submit">创建账号</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createCustomerBatch, currentMember } from '@/mock/store'
import { copyText } from '@/utils/customerNudge'

const props = defineProps({ visible: Boolean, projectHint: String, scope: { type: String, default: 'customers' } })
const emit = defineEmits(['update:visible', 'created'])
const count = ref(1)
const text = ref('')
const busy = ref(false)
const accounts = ref([])
const error = ref('')
const names = computed(() => text.value.split(/\r?\n/).map(v => v.trim()).filter(Boolean))
let pending = null
const storageKey = () => 'xc.customer-batch.' + currentMember.value.id + '.' + props.scope
watch(() => props.visible, shown => {
  if (!shown) return
  pending = null
  try { pending = JSON.parse(sessionStorage.getItem(storageKey())) } catch { /* Storage is optional. */ }
  count.value = pending?.count || 1
  text.value = pending?.names?.join('\n') || ''
  accounts.value = []
  error.value = pending ? '上次创建结果未返回，点「创建账号」可取回同一批账号。' : ''
})
function close() {
  if (!busy.value) emit('update:visible', false)
}
async function submit() {
  if (busy.value || accounts.value.length) return
  const amount = names.value.length || count.value
  if (!Number.isInteger(amount) || amount < 1 || amount > 50) { error.value = '每批可创建 1 至 50 个账号'; return }
  if (names.value.some(name => [...name].length > 30)) { error.value = '姓名最多可填 30 个字'; return }
  error.value = ''
  const payload = { count: amount, names: names.value }
  if (!pending || amount !== pending.count || JSON.stringify(payload.names) !== JSON.stringify(pending.names)) {
    pending = { ...payload, requestKey: crypto.randomUUID() }
  }
  const key = storageKey()
  try { sessionStorage.setItem(key, JSON.stringify(pending)) } catch { /* Same-dialog retries still work. */ }
  busy.value = true
  try {
    accounts.value = await createCustomerBatch(pending)
    pending = null
    try { sessionStorage.removeItem(key) } catch { /* optional */ }
    emit('created', accounts.value)
  } catch (e) {
    error.value = e.message || '创建结果未返回，请重试'
  } finally { busy.value = false }
}
function copy(items) {
  const lines = items.map(item => item.nickName === item.userName ? item.userName : item.nickName + '　' + item.userName)
  copyText([location.origin + '/client/', ...lines, '初始密码：123456'].join('\n'), '已复制登录信息')
}
</script>

<style scoped>
.batch-hint { color: #53627a; font-size: 13px; line-height: 1.6; margin: 8px 0 0; }
.batch-results { list-style: none; padding: 0; margin: 12px 0 0; max-height: 36vh; overflow: auto; }
.batch-results li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid #eef1f6; }
.batch-results strong { margin-right: 8px; }
.batch-results code { user-select: all; font-size: 15px; }
.batch-error { color: #a24212; margin-bottom: 0; }
</style>
