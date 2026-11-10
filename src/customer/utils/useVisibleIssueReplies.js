import { nextTick, onBeforeUnmount, watch } from 'vue'
import { customerToken, markIssueReplyRead } from '@/customer/mock/store'

// Only a single opened issue owns a read cursor. Project lists and other tabs
// may render the same records in the DOM without the customer reading them.
export function useVisibleIssueReplies(projectId, issue, targetUpdateId, scroller) {
  const acknowledged = new Map()
  const pending = new Set()
  let timer
  let pinnedTarget = ''
  let active = true

  function visibleOnScreen(element, frame) {
    const rect = element.getBoundingClientRect()
    const left = Math.max(rect.left, frame.left, 0)
    const right = Math.min(rect.right, frame.right, window.innerWidth)
    const top = Math.max(rect.top, frame.top, 0)
    const bottom = Math.min(rect.bottom, frame.bottom, window.innerHeight)
    if (right <= left || bottom - top < Math.min(18, rect.height) || rect.height < 1) return false
    return element.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
  }

  async function acknowledgeVisible() {
    const bug = issue.value
    const root = scroller.value
    if (!active || !bug || !root || document.hidden || pending.has(bug.id)) return
    const lastRead = acknowledged.get(bug.id) || 0
    const frame = root.getBoundingClientRect()
    let newest = lastRead
    for (const row of root.querySelectorAll('[data-team-reply]')) {
      const id = Number(row.dataset.teamReply)
      if (id > newest && visibleOnScreen(row, frame)) newest = id
    }
    if (newest === lastRead) return
    const owner = customerToken.value
    const account = localStorage.getItem('customerAccount')
    pending.add(bug.id)
    try {
      await markIssueReplyRead(projectId, bug.id, newest)
      acknowledged.set(bug.id, newest)
      if (owner && owner === customerToken.value && account === localStorage.getItem('customerAccount')) {
        window.dispatchEvent(new CustomEvent('customer-issue-reply-read', {
          detail:{account, projectId, issueId:bug.id, updateId:newest}
        }))
      }
    } catch {
      // The next sync/scroll retries only replies which are still on screen.
    } finally {
      pending.delete(bug.id)
    }
  }
  function refreshVisibleReplies() {
    clearTimeout(timer)
    if (active && issue.value && !document.hidden) timer = setTimeout(acknowledgeVisible, 260)
  }

  watch([() => issue.value?.id, targetUpdateId, scroller,
    () => issue.value?.updates?.map(update => update.id + '/' + update.senderKind).join(',')
  ], async (_, __, onCleanup) => {
    let stale = false
    let observer
    const root = scroller.value
    onCleanup(() => {
      stale = true
      clearTimeout(timer)
      observer?.disconnect()
      root?.removeEventListener('scroll', refreshVisibleReplies)
    })
    if (!issue.value || !root) { pinnedTarget = ''; return }
    await nextTick()
    if (stale) return
    const rows = [...root.querySelectorAll('.bug-update, [data-team-reply]')]
    const target = targetUpdateId.value && rows.find(row => row.id === 'issue-reply-' + targetUpdateId.value)
    if (!target) pinnedTarget = ''
    else if (pinnedTarget !== target.id) {
      target.scrollIntoView({block:'center', behavior:'instant'})
      pinnedTarget = target.id
    }
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(refreshVisibleReplies, {root})
      for (const row of rows) if (row.hasAttribute('data-team-reply')) observer.observe(row)
    }
    root.addEventListener('scroll', refreshVisibleReplies, {passive:true})
    refreshVisibleReplies()
  }, {flush:'post', immediate:true})

  onBeforeUnmount(() => {
    active = false
    clearTimeout(timer)
  })
  return {refreshVisibleReplies}
}
