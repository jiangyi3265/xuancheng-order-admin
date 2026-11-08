<template>
  <section class="pending-projects" aria-labelledby="pending-projects-heading">
    <header>
      <h2 id="pending-projects-heading">待处理 <span>{{ items.length }} 条</span></h2>
      <button v-if="items.length > limit" type="button" :aria-expanded="expanded" aria-controls="pending-project-links"
        @click="expanded = !expanded">{{ expanded ? '收起' : '查看全部 ' + items.length + ' 条' }}</button>
      <span v-if="!items.length" class="pending-empty">当前没有待处理事项</span>
    </header>
    <ul v-if="items.length" id="pending-project-links">
      <li v-for="item in visibleItems" :key="item.key">
        <router-link :to="destination(item)" class="pending-link">
          <span class="pending-kind" :class="item.kind">{{ labels[item.kind] }}</span>
          <span class="pending-copy">
            <strong>{{ item.title }}</strong>
            <span>{{ item.text }}</span>
            <small v-if="item.meta">{{ item.meta }}</small>
          </span>
          <el-icon aria-hidden="true"><ArrowRight /></el-icon>
        </router-link>
        <button type="button" class="pending-remind" :disabled="sending.has(item.key)"
          :aria-label="item.title + '，提醒' + (item.recipient || '负责人') + '处理' + labels[item.kind]"
          :title="'微信提醒' + (item.recipient || '负责人')" @click.stop="remind(item, $event)">
          {{ sending.has(item.key) ? '发送中' : '提醒' }}
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { loadOrders, remindPendingItem } from '@/mock/store'
import { useRoute } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { memberMap } from '@/constants/options'
import { isMobile } from '@/utils/useMobile'
import { fmtTime } from '@/utils/time'

const props = defineProps({ orders: { type: Array, required: true } })
const route = useRoute()
const expanded = ref(false)
const sending = reactive(new Set())
const limit = computed(() => isMobile.value ? 2 : 3)
const labels = { urgent: '加急', bug: '问题', next: '下一步', manual: '手动标记' }

const items = computed(() => {
  const groups = { urgent: [], bug: [], next: [], manual: [] }
  for (const row of props.orders) {
    if (row.status === 'done' || row.status === 'cancelled') continue
    const owner = memberMap[row.ownerId]?.name || ''
    const project = { id: row.id, title: row.title, order: row, recipient: owner }
    if (row.urgentUntil && !row.handled) {
      groups.urgent.push({ ...project, key: row.id + '-urgent', kind: 'urgent',
        text: '截止 ' + row.urgentUntil, meta: owner, due: row.urgentUntil })
    }
    if (Number(row.actionBugCount) > 0) {
      const bugs = row.actionBugPreviews || []
      if (bugs.length) {
        for (const bug of bugs) {
          groups.bug.push({ ...project, key: row.id + '-bug-' + bug.id, kind: 'bug', bugId: bug.id,
            text: bug.content?.trim() || '查看问题附件', meta: owner })
        }
      } else {
        // Older list responses have the count only. Use the existing project issue queue.
        groups.bug.push({ ...project, key: row.id + '-bugs', kind: 'bug',
          text: row.actionBugCount + ' 个问题需处理', meta: owner })
      }
    }
    if (row.nextStep?.trim()) {
      const assignee = memberMap[row.nextOwnerId]?.name || row.nextOwnerName || owner
      groups.next.push({ ...project, key: row.id + '-next', kind: 'next', text: row.nextStep, recipient: assignee,
        meta: [assignee, row.nextDue && ('截止 ' + row.nextDue)].filter(Boolean).join(' · '), due: row.nextDue })
    }
    if (!row.handled && row.handledTime) {
      groups.manual.push({ ...project, key: row.id + '-manual', kind: 'manual', text: '项目已标为未处理',
        meta: [owner, fmtTime(row.handledTime)].filter(Boolean).join(' · ') })
    }
  }
  const dueFirst = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.id - a.id
  groups.urgent.sort(dueFirst)
  groups.next.sort(dueFirst)
  groups.bug.sort((a, b) => (b.bugId || 0) - (a.bugId || 0))
  return [...groups.urgent, ...groups.bug, ...groups.next, ...groups.manual]
})
const visibleItems = computed(() => expanded.value ? items.value : items.value.slice(0, limit.value))

async function remind(item, event) {
  if (sending.has(item.key) || event.detail > 1) return
  sending.add(item.key)
  try {
    await remindPendingItem(item.order, item.kind, item.bugId)
    ElMessage.success('已向' + (item.recipient || '负责人') + '发送微信提醒')
  } catch (err) {
    ElMessage.error(err.message || '微信提醒发送失败')
  } finally {
    await loadOrders().catch(() => {})
    sending.delete(item.key)
  }
}

function destination(item) {
  const query = { ...route.query, id: String(item.id) }
  for (const key of ['tab', 'entry', 'bug', 'todo', 'followup', 'create', 't']) delete query[key]
  if (item.kind === 'bug') {
    query.tab = 'bugs'
    if (item.bugId) query.bug = String(item.bugId)
    else query.todo = '1'
  } else if (item.kind === 'manual') query.followup = 'manual'
  return { path: '/order', query }
}
</script>

<style scoped>
.pending-projects { background: #fff; border: 1px solid #e2e9f4; border-radius: 14px; padding: 12px 16px; margin: 0 0 12px; }
.pending-projects header { display: flex; align-items: center; gap: 12px; }
.pending-projects h2 { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 16px; color: #1e304f; }
.pending-projects h2 span, .pending-empty { color: #64748b; font-size: 12px; font-weight: 400; }
.pending-projects header button { margin-left: auto; padding: 4px; border: 0; background: transparent; color: #1757c7; font: inherit; font-size: 13px; cursor: pointer; }
.pending-projects ul { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(245px,100%),1fr)); gap: 8px; padding: 0; margin: 8px 0 0; list-style: none; }
.pending-projects li { display: flex; min-width: 0; background: #f7f9fc; border: 1px solid #e5ebf4; border-radius: 9px; }
.pending-link { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px; border-radius: 8px; text-decoration: none; color: #263958; }
.pending-link:hover, .pending-link:focus-visible { background: #edf3ff; }
.pending-remind { align-self: center; flex: none; margin: 0 8px 0 2px; padding: 5px 9px; color: #1757c7; background: white; border: 1px solid #c3d5f3; border-radius: 7px; font: inherit; font-size: 13px; cursor: pointer; }
.pending-remind:hover, .pending-remind:focus-visible { background: #eaf1ff; border-color: #7b9de4; }
.pending-remind:disabled { color: #68788d; cursor: wait; }
.pending-kind { flex: none; padding: 2px 6px; border-radius: 5px; background: #e8f0ff; color: #2355a4; font-size: 12px; line-height: 18px; }
.pending-kind.urgent { color: #aa3029; background: #ffebe9; }
.pending-kind.bug { color: #854403; background: #fff0d6; }
.pending-kind.manual { color: #57428c; background: #efeafa; }
.pending-copy { display: grid; min-width: 0; gap: 3px; flex: 1; }
.pending-copy strong { font-size: 14px; }
.pending-copy > span { color: #40536e; font-size: 13px; line-height: 1.45; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.pending-copy strong, .pending-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pending-copy small { color: #64748b; font-size: 12px; }
.pending-link > .el-icon { margin: auto 0; color: #6a7e9e; }
@media (max-width: 768px) {
  .pending-projects { margin: 6px 0 8px; padding: 10px; }
  .pending-projects ul { grid-template-columns: 1fr; gap: 5px; }
  .pending-link { padding: 7px 9px; }
  .pending-remind { min-height: 44px; min-width: 44px; }
}
</style>
