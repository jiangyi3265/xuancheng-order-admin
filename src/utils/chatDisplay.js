import { ref } from 'vue'
import { dayLabel, fmtTime } from './time'

export function chatGroup(item, previous) {
  const date = fmtTime(item.time).slice(0, 10)
  const newDay = !previous || date !== fmtTime(previous.time).slice(0, 10)
  const continued = !newDay && item.type === previous.type && item.user === previous.user
  const minutes = s => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16))
  const interval = previous ? minutes(fmtTime(item.time)) - minutes(fmtTime(previous.time)) : Infinity
  return { day: newDay ? dayLabel(item.time) : '', meta: !continued || !item.time || interval < 0 || interval >= 5 }
}

// Read the position before Vue inserts new rows, so their height cannot affect the decision.
export function useChatArrival(container) {
  const hasNew = ref(false)
  const nearBottom = () => {
    const el = container.value
    return !el || el.scrollHeight - el.clientHeight - el.scrollTop <= 80
  }
  function onScroll() { if (nearBottom()) hasNew.value = false }
  function onArrival(scroll) {
    if (nearBottom()) scroll()
    else hasNew.value = true
  }
  return { hasNew, onScroll, onArrival }
}
