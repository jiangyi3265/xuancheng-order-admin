import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast as ElMessage } from '@/utils/toast'
import { orders, getOrder } from '@/mock/store'

function listQuery(query) {
  const { id, t, tab, bug, entry, todo, followup, create, open, ...filters } = query
  return filters
}

// Both list and workbench keep their mounted list and scroll containers behind the drawer.
export function useProjectDetail(path, rowsForProject) {
  const route = useRoute()
  const router = useRouter()
  const active = ref(null)
  const detailLoading = ref(false)
  const projectId = computed(() => route.path === path && /^\d+$/.test(route.query.id || '') ? Number(route.query.id) : 0)
  const detailVisible = computed({
    get: () => !!projectId.value,
    set(shown) {
      if (shown || !projectId.value) return
      const list = { path, query: listQuery(route.query) }
      if (history.state?.back === router.resolve(list).fullPath) router.back()
      else router.replace(list)
    }
  })

  const snapshot = ref([])
  const rowIds = id => [...new Set(rowsForProject(id).map(row => row.id))]
  const sequence = computed(() => snapshot.value.length ? snapshot.value : rowIds(projectId.value))
  const index = computed(() => sequence.value.indexOf(projectId.value))
  const hasPrevious = computed(() => index.value > 0)
  const hasNext = computed(() => index.value >= 0 && index.value + 1 < sequence.value.length)
  function openDetail(row, tab = '', target = {}) {
    snapshot.value = rowIds(row.id)
    router.push({ path, query: { ...listQuery(route.query), id: String(row.id), ...(tab && { tab }), ...target } })
  }
  function moveDetail(step) {
    const nextId = sequence.value[index.value + step]
    if (index.value < 0 || !nextId) return
    if (!snapshot.value.length) snapshot.value = [...sequence.value]
    router.replace({ path, query: { ...listQuery(route.query), id: String(nextId), ...(route.query.tab && { tab: route.query.tab }) } })
  }

  watch(projectId, async (id, _, onCleanup) => {
    if (!id) { snapshot.value = []; detailLoading.value = false; return }
    let cancelled = false
    onCleanup(() => { cancelled = true })
    active.value = orders.find(row => row.id === id) || { id }
    detailLoading.value = true
    try {
      const project = await getOrder(id)
      if (cancelled) return
      if (!project) throw new Error('项目已删除或当前账号无法查看')
      active.value = project
    } catch (err) {
      if (cancelled) return
      ElMessage.error('加载项目失败：' + err.message)
      detailVisible.value = false
    } finally {
      if (!cancelled) detailLoading.value = false
    }
  }, { immediate: true })

  const noticeTab = computed(() => ['bugs', 'chat', 'internal', 'overview', 'all'].includes(route.query.tab) ? route.query.tab : '')
  const noticeItem = computed(() => {
    if (noticeTab.value === 'bugs' && route.query.todo === '1' && !route.query.bug) {
      const marked = (active.value?.bugs || []).filter(bug => bug.status === 'action')
      return marked.length === 1 ? String(marked[0].id) : ''
    }
    const id = noticeTab.value === 'bugs' ? route.query.bug : route.query.entry
    return typeof id === 'string' && /^\d+$/.test(id) ? id : ''
  })
  return { active, detailVisible, detailLoading, noticeTab, noticeItem, hasPrevious, hasNext, openDetail, moveDetail }
}
