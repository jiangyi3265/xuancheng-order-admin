import {ref, computed, watch} from 'vue'
import {adminHttp, currentMember, isBoss, markAllRead} from '@/mock/store'

export const quotes = ref([])
export const quoteLoadError = ref('')
export const quoteStatus = {pending:'待报价', quoted:'已报价', converted:'已转项目'}
const relevantStatus = computed(() => isBoss.value ? 'quoted' : 'pending')
export const quoteTodos = computed(() => quotes.value.filter(q => q.status === relevantStatus.value || q.replyVersion > 0))
export function isQuoteUnread(q) {
  return Number(q.replyVersion)>0 || q.status === relevantStatus.value && (!isBoss.value || q.creatorId === currentMember.value.id) && Number(q.noticeVersion) > Number(q.readVersion || 0)
}
export const unreadQuotes = computed(() => quotes.value.filter(isQuoteUnread))

let generation = 0
let latestRequest = 0
watch(() => currentMember.value.id, () => {
  generation++
  latestRequest++
  quotes.value = []
  quoteLoadError.value = ''
}, {flush:'sync'})

export async function syncQuotes() {
  const request = ++latestRequest
  try {
    const rows = await adminHttp('/jiedan/quote/list')
    if (request === latestRequest) {
      quotes.value = Array.isArray(rows) ? rows : []
      quoteLoadError.value = ''
    }
  } catch (e) {
    if (request === latestRequest) quoteLoadError.value = e.message
    throw e
  }
}
export async function quoteRequest(path, method='GET', data) {
  const result = await adminHttp('/jiedan/quote' + path, {method, ...(data === undefined ? {} : {body:JSON.stringify(data)})})
  if (method !== 'GET') await syncQuotes().catch(() => {})
  return result
}
export async function markQuotesRead(rows) {
  const owner = generation
  const items = rows.filter(isQuoteUnread).map(({id, noticeVersion, replyVersion}) => ({id, noticeVersion, ...(replyVersion>0?{replyVersion}:{})}))
  for (let i = 0; i < items.length; i += 200) {
    if (owner !== generation) return
    const batch = items.slice(i, i + 200)
    await adminHttp('/jiedan/quote/read', {method:'PUT', body:JSON.stringify(batch)})
    if (owner !== generation) return
    latestRequest++
    for (const {id, noticeVersion, replyVersion} of batch) {
      const q = quotes.value.find(item => item.id === id)
      if(q){
        if(q.status===relevantStatus.value) q.readVersion=Math.max(q.readVersion || 0,noticeVersion)
        if(replyVersion && q.replyVersion<=replyVersion)q.replyVersion=0
      }
    }
  }
  if (items.length && owner === generation) await syncQuotes().catch(() => {})
}
export async function markInboxRead(memberId) {
  const batch = unreadQuotes.value.slice()
  const [project, quote] = await Promise.all([
    markAllRead(memberId), markQuotesRead(batch).then(() => 0, () => batch.length)
  ])
  return {total:project.total + batch.length, failed:project.failed + quote}
}
