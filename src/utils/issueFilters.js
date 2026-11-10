import { onBeforeUnmount, onMounted, ref } from 'vue'

const minuteMs = 60000
const dayMs = 24 * 60 * minuteMs

export const issueTimeOptions = [
  {days: 0, label: '全部时间'},
  {days: 1, label: '近 1 天'},
  {days: 3, label: '近 3 天'}
]
export const issueStateOptions = [
  {value: 'all', label: '全部状态'},
  {value: 'unresolved', label: '未解决'},
  {value: 'resolved', label: '已解决'}
]

function submissionTime(issue) {
  const value = issue.submittedAt || issue.time
  if (!value) return -Infinity
  // Summary and detail responses both use Shanghai wall time, regardless of the viewer's time zone.
  const iso = String(value).replace(' ', 'T')
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso)
  const timestamp = Date.parse(local ? iso + '+08:00' : iso)
  return Number.isFinite(timestamp) ? timestamp : -Infinity
}

export function newestIssueFirst(a, b) {
  return submissionTime(b) - submissionTime(a) || Number(b.id) - Number(a.id)
}

export function matchesIssueFilters(issue, days, state, minute) {
  const status = issue.progressStatus || issue.status || 'open'
  if (state === 'unresolved' && status === 'resolved') return false
  if (state !== 'all' && state !== 'unresolved' && state !== status) return false
  if (!days) return true
  const now = minute * minuteMs
  const submitted = submissionTime(issue)
  return submitted >= now - days * dayMs && submitted < now + minuteMs
}

// Refresh rolling time windows at minute boundaries, including after the tab wakes up.
export function useIssueFilterClock() {
  const minute = ref(Math.floor(Date.now() / minuteMs))
  let timer
  function sync() {
    clearTimeout(timer)
    if (document.hidden) return
    const now = Date.now()
    minute.value = Math.floor(now / minuteMs)
    timer = setTimeout(sync, minuteMs - now % minuteMs)
  }
  onMounted(() => {
    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
  })
  onBeforeUnmount(() => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('focus', sync)
  })
  return minute
}
