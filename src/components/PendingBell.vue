<template>
  <button type="button" class="pending-bell" aria-haspopup="dialog" :aria-expanded="open"
    :aria-label="'待处理通知，' + todoItems.length + ' 条'" title="查看待处理通知" @click="show">
    <el-icon aria-hidden="true"><Bell /></el-icon>
    <span v-if="todoItems.length" class="bell-count" aria-hidden="true">{{ todoItems.length }}</span>
  </button>
  <el-drawer v-if="mounted" v-model="open" @closed="mounted = open" title="待处理通知"
    :size="isMobile ? '100%' : '470px'" append-to-body destroy-on-close>
    <section class="bell-panel" aria-label="轮到我">
      <header><strong>轮到我 {{ todoItems.length }}</strong><router-link to="/settings" @click="open = false">通知设置</router-link></header>
      <p v-if="error" role="alert">{{ error }} <button type="button" :disabled="loading" @click="refresh">重试</button></p>
      <p v-else-if="!todoItems.length" role="status">{{ loading ? '正在加载…' : '当前没有轮到你的事项' }}</p>
      <ul><li v-for="item in todoItems" :key="item.key">
        <HandoffCard v-if="item.handoff" :item="item" @open="open = false" />
        <ApprovalItem v-else-if="item.approval" :a="item.approval" />
        <router-link v-else class="legacy-todo" :to="destination(item)" @click="open = false">
          <strong>{{ item.order.title }}</strong><span>{{ item.text }}</span><span class="open-action">{{ item.kind === 'reply' ? '回复客户' : '去处理' }}</span>
        </router-link>
      </li></ul>
    </section>
  </el-drawer>
</template>
<script setup>
import { ref } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import HandoffCard from './HandoffCard.vue'
import ApprovalItem from './ApprovalItem.vue'
import { loadApprovals, loadOrders } from '@/mock/store'
import { todoItems } from '@/utils/todos'
import { isMobile } from '@/utils/useMobile'
const open = ref(false)
const mounted = ref(false)
const loading = ref(false)
const error = ref('')
function destination(item) {
  const query = { id: String(item.order.id) }
  if (item.kind === 'reply') query.tab = 'chat'
  if (['mention','nudge'].includes(item.kind)) query.tab = 'internal'
  return { path: '/order', query }
}
async function refresh() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try { await Promise.all([loadOrders(), loadApprovals()]) }
  catch (err) { error.value = err.message || '加载失败，请重试' }
  finally { loading.value = false }
}
function show() {
  mounted.value = true
  open.value = true
  refresh()
}
</script>
<style scoped>
.pending-bell { position: relative; display: inline-grid; flex: none; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #526581; font-size: 20px; cursor: pointer; }
.pending-bell:hover, .pending-bell:focus-visible { color: #1757c7; background: #edf3ff; }
.bell-count { position: absolute; top: 0; right: -5px; min-width: 16px; padding: 0 3px; box-sizing: border-box; border-radius: 10px; background: #c43535; color: white; font: 600 11px/16px system-ui; }

header {display:flex;align-items:center;justify-content:space-between;color:#243957;margin-bottom:12px}
header a,.open-action {font-size:13px;color:#2158aa}
ul {display:grid;gap:8px;margin:0;padding:0;list-style:none}
.legacy-todo {display:grid;gap:6px;padding:12px 14px;border:1px solid #dce5f1;border-radius:10px;color:#304760;text-decoration:none;overflow-wrap:anywhere}
.legacy-todo span,p {font-size:14px}
@media(max-width:768px){.pending-bell {min-width:44px;min-height:44px}}
</style>
