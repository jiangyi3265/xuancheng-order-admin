import { onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { isMobile } from '@/utils/useMobile'

export async function confirmDiscard(dirty) {
  if (!dirty) return true
  try {
    await ElMessageBox.confirm('放弃已填的内容？', '放弃修改', {
      confirmButtonText: '放弃', cancelButtonText: '继续填', closeOnClickModal: false, closeOnHashChange: false
    })
    return true
  } catch { return false }
}

// Element's before-close covers ✕ and Esc; the footer and browser Back share the same decision.
export function useFormClose({ visible, close, name, isDirty = () => false, isBusy = () => false }) {
  const router = useRouter()
  let asking
  function mayClose() {
    if (isBusy()) return Promise.resolve(false)
    if (!asking) asking = confirmDiscard(isDirty()).finally(() => { asking = null })
    return asking
  }
  async function requestClose() {
    if (await mayClose()) close()
  }
  if (name) {
    let parentPath = ''
    let markedPath = ''
    const removeGuard = router.beforeEach((to, from) => {
      if (visible() && markedPath === from.fullPath && to.fullPath === parentPath) return mayClose()
    })
    const removeAfter = router.afterEach((to, from, failure) => {
      if (!failure && markedPath && from.fullPath === markedPath && to.fullPath === parentPath) {
        markedPath = ''
        if (visible()) close()
      }
    })
    watch(visible, async shown => {
      const route = router.currentRoute.value
      if (shown && isMobile.value) {
        const { create, ...query } = route.query
        const kind = typeof name === 'function' ? name() : name
        if (query.open === kind) delete query.open
        parentPath = router.resolve({ path: route.path, query }).fullPath
        const child = { path: route.path, query: { ...query, open: kind } }
        markedPath = router.resolve(child).fullPath
        if (route.fullPath === markedPath) return
        if (create === '1') await router.replace(child)
        else await router.push(child)
      } else if (!shown && markedPath && route.fullPath === markedPath) {
        if (window.history.state?.back === parentPath) router.back()
        else router.replace(parentPath)
      }
    })
    onBeforeUnmount(() => { removeGuard(); removeAfter() })
  }
  return requestClose
}
