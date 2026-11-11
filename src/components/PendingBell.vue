<template>
  <button type="button" class="pending-bell" aria-haspopup="dialog" :aria-expanded="open"
    :aria-label="'待处理通知，' + items.length + ' 条'" title="查看待处理通知" @click="show">
    <el-icon aria-hidden="true"><Bell /></el-icon>
    <span v-if="items.length" class="bell-count" aria-hidden="true">{{ items.length > 99 ? '99+' : items.length }}</span>
  </button>
  <el-drawer v-if="drawerMounted" v-model="open" @closed="drawerMounted = open" title="待处理通知" :size="isMobile ? '100%' : '470px'" append-to-body destroy-on-close>
    <div class="bell-panel">
      <div class="panel-tools">
        <strong>我的待处理 {{ items.length }} 条</strong>
        <router-link to="/settings" @click="open = false">通知设置</router-link>
      </div>
      <div v-if="loadError" role="alert" class="load-error">{{ loadError }} <button type="button" @click="refresh" :disabled="loading">重试</button></div>
      <p v-if="!items.length && !loadError" role="status">{{ loading ? '正在加载…' : '当前没有分给你的待处理事项' }}</p>
      <ul v-if="items.length">
        <li v-for="item in items" :key="item.key">
          <router-link :to="pendingDestination(item, route.path === '/order' ? route.query : {})" @click="open = false">
            <span class="item-head"><small :class="item.kind">{{ pendingLabels[item.kind] }}</small><strong>{{ item.title }}</strong></span>
            <span class="item-text">{{ item.text }}</span>
            <span v-if="item.meta" class="meta">{{ item.meta }}</span>
          </router-link>
          <button v-if="item.kind === 'urgent' && !isBoss && item.order.assignState === 'pending'" class="complete"
            type="button" @click="open = false; router.push(pendingDestination(item))">去接单</button>
          <button v-else-if="!item.fresh && (item.kind !== 'bug' || item.bugId)" class="complete" type="button"
            :disabled="loading || !!loadError || busy.has(item.id)" :aria-label="'标为已处理，' + actionTitle(item)" :title="actionTitle(item)" @click="finish(item)">
            {{ busy.get(item.id) === item.key ? '处理中…' : '标为已处理' }}
          </button>
        </li>
      </ul>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { toast as ElMessage } from '@/utils/toast'
import { finishPendingWithUndo } from '@/utils/orderUndo'
import { loadOrders, me, orders, isBoss } from '@/mock/store'
import { pendingItems, pendingLabels, pendingDestination } from '@/utils/pendingItems'
import { isMobile } from '@/utils/useMobile'

const route = useRoute()
const router = useRouter()
const open = ref(false)
const drawerMounted = ref(false)
const loading = ref(false)
const loadError = ref('')
const busy = reactive(new Map())
const items = computed(() => {
  const memberId = me.value?.id
  if (memberId == null) return []
  return pendingItems(orders).filter(item => item.recipientId != null && String(item.recipientId) === String(memberId))
})

function actionTitle(item) {
  const actions = { bug: '解决问题', next: '完成下一步', urgent: '结束本次加急', manual: '将项目标为已处理' }
  return item.title + '：' + actions[item.kind] + (item.bugId ? ' #' + item.bugId : '')
}

async function refresh() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try { await loadOrders() }
  catch (err) { loadError.value = err.message || '加载待处理通知失败' }
  finally { loading.value = false }
}

function show() {
  drawerMounted.value = true
  open.value = true
  refresh()
}

async function finish(item) {
  if (busy.has(item.id)) return
  busy.set(item.id, item.key)
  try {
    await finishPendingWithUndo(item.order, item.kind, item.bugId, '已处理：' + item.title + ' · ' + pendingLabels[item.kind])
  } catch (err) {
    ElMessage.error(err.message || '标记失败，请重试')
    await refresh()
  } finally {
    busy.delete(item.id)
  }
}
</script>

<style scoped>
.pending-bell { position: relative; display: inline-grid; flex: none; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #526581; font-size: 20px; cursor: pointer; }
.pending-bell:hover, .pending-bell:focus-visible { color: #1757c7; background: #edf3ff; }
.bell-count { position: absolute; top: 0; right: -5px; min-width: 16px; padding: 0 3px; box-sizing: border-box; border-radius: 10px; background: #c43535; color: white; font: 600 11px/16px system-ui; }
.panel-tools, .item-head { display: flex; align-items: center; gap: 8px; }
.panel-tools { justify-content: space-between; margin-bottom: 12px; color: #213653; }
.panel-tools a { color: #1757c7; font-size: 13px; }
.bell-panel ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.bell-panel li { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e0e7f2; border-radius: 10px; background: #f8faff; }
.bell-panel li a { min-width: 0; flex: 1; display: grid; gap: 5px; color: #263958; text-decoration: none; overflow-wrap: anywhere; }
.bell-panel li a:hover strong { color: #1757c7; text-decoration: underline; }
.item-head { align-items: baseline; }
.item-head small { flex: none; padding: 2px 5px; border-radius: 5px; color: #2456a4; background: #e7efff; }
.item-head .urgent { color: #a4312a; background: #ffebe9; }
.item-head .bug { color: #814601; background: #fff0d6; }
.item-text { font-size: 14px; }
.meta, .bell-panel p { color: #596d89; font-size: 13px; }
.complete, .load-error button { border: 1px solid #c4d5f1; border-radius: 7px; background: white; color: #1757c7; padding: 7px 9px; font: inherit; font-size: 13px; cursor: pointer; }
.complete { flex: none; }
.complete:disabled { opacity: .6; cursor: wait; }
.load-error { color: #a33230; margin-bottom: 12px; }
@media (max-width: 768px) { .pending-bell, .complete { min-height: 44px; } .pending-bell { min-width: 44px; } }
</style>
