<template>
  <div class="work-search" :class="{ 'on-mobile': isMobile }"
    @keydown.capture="guardComposition" @keydown="rememberSelection">
    <el-autocomplete ref="field" v-model="keyword" :fetch-suggestions="suggest"
      :trigger-on-focus="false" :debounce="0" highlight-first-item clearable :prefix-icon="Search"
      aria-label="搜索项目和报价" value-key="title"
      :placeholder="isMobile ? '搜项目、报价、单号或姓名' : '搜项目、报价、单号或姓名　' + shortcutHint"
      popper-class="work-search-popper" @focus="focused = true" @blur="focused = false"
      @input="clearSelection" @select="openResult">
      <template #default="{ item }">
        <div class="work-result">
          <span class="kind" :class="{ quotation: item.path === '/quotes' }">{{ item.kind }}</span>
          <div class="summary">
            <strong>{{ item.title }}</strong>
            <small>{{ [item.number, item.person].filter(Boolean).join(' · ') }}</small>
          </div>
          <span class="state">{{ item.statusLabel }}</span>
        </div>
      </template>
    </el-autocomplete>
    <div v-if="focused && term && !results.length" class="no-match" role="status">{{ loading ? '正在加载项目和报价…' : '当前列表里没有匹配的项目或报价' }}</div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { currentMember, isBoss, orders } from '@/mock/store'
// 快捷键提示按电脑系统显示：苹果电脑 ⌘K，Windows Ctrl+K
const shortcutHint = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl+K'
import { quotes, quoteStatus } from '@/stores/quotes'
import { memberMap, statusMap } from '@/constants/options'
import { isMobile } from '@/utils/useMobile'

defineProps({ loading: Boolean })
const field = ref(null)
const keyword = ref('')
const focused = ref(false)
const router = useRouter()
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
const compactNumber = value => value.replace(/[-‐‑–—]/g, '')
const term = computed(() => normalize(keyword.value))

function indexItem(item, number, names) {
  return {
    ...item, number,
    searchNumber: compactNumber(normalize(number)),
    searchTitle: normalize(item.title),
    searchNames: names.filter(Boolean).map(normalize)
  }
}

function inScope(id) {
  return isBoss.value || (currentMember.value.id > 0 && String(id) === String(currentMember.value.id))
}

const index = computed(() => [
  ...orders.filter(order => inScope(order.ownerId)).map(order => indexItem({
    kind: '项目', path: '/order', id: order.id, title: order.title,
    person: order.customer || memberMap[order.ownerId]?.name,
    statusLabel: statusMap[order.status]?.label,
    closed: ['done','cancelled'].includes(order.status)
  }, order.orderNo, [order.customer, order.contact, memberMap[order.ownerId]?.name])),
  ...quotes.value.filter(quote => inScope(quote.employeeId)).map(quote => indexItem({
    kind: '报价', path: '/quotes', id: quote.id, title: quote.title,
    person: quote.sourceName || quote.employeeName,
    statusLabel: quoteStatus[quote.status], closed: quote.status === 'converted'
  }, quote.quoteNo, [quote.sourceName, quote.employeeName, quote.creatorName]))
])

function matchRank(item, text, number) {
  if (number && item.searchNumber === number) return 0
  if (item.searchTitle === text) return 1
  if ((number && item.searchNumber.startsWith(number)) || item.searchTitle.startsWith(text)) return 2
  if (item.searchTitle.includes(text) || (number && item.searchNumber.includes(number))) return 3
  return item.searchNames.some(name => name.includes(text)) ? 4 : -1
}

const results = computed(() => {
  const text = term.value
  if (!text) return []
  const number = compactNumber(text)
  const matches = []
  for (const item of index.value) {
    const rank = matchRank(item, text, number)
    if (rank >= 0) matches.push({item, rank})
  }
  return matches.sort((a,b) => a.rank - b.rank || Number(a.item.closed) - Number(b.item.closed))
    .slice(0,12).map(match => match.item)
})

let keyboardSelection = null
function clearSelection() {
  keyboardSelection = null
}
function guardComposition(event) {
  if (event.isComposing || event.keyCode === 229 || field.value?.inputRef?.isComposing) {
    event.stopPropagation()
  }
}
function rememberSelection(event) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const picker = field.value
    keyboardSelection = picker?.suggestions[picker.highlightedIndex] || null
  }
}
function suggest(_text, callback) {
  const rows = results.value
  callback(rows)
  const picker = field.value
  if (!keyboardSelection || !picker) return
  // Refreshes can reorder, replace or remove the row a user chose with the arrow keys.
  const position = rows.findIndex(item => item.path === keyboardSelection.path && item.id === keyboardSelection.id)
  picker.highlightedIndex = position
  if (position < 0) {
    picker.inputRef?.ref?.removeAttribute('aria-activedescendant')
  } else {
    nextTick(() => {
      if (field.value === picker && picker.activated && picker.highlightedIndex === position) picker.highlight(position)
    })
  }
}
// The account's project and quote lists may finish loading after the user has typed.
watch(() => focused.value && term.value ? results.value : null, rows => {
  if (rows && field.value?.activated) field.value.getData(keyword.value)
})

function openResult(item) {
  keyword.value = ''
  field.value?.close()
  field.value?.blur()
  router.push({ path: item.path, query: { id: String(item.id) } })
}

defineExpose({ focus: () => field.value?.focus() })
</script>

<style scoped>
.work-search { position:relative; min-width:0 }
.work-search :deep(.el-autocomplete) { width:100% }
.work-search.on-mobile { margin:12px 0 10px }
.no-match { position:absolute; top:calc(100% + 4px); width:100%; z-index:5; padding:9px 12px; box-sizing:border-box; background:white; border:1px solid #dbe5f1; border-radius:8px; color:#516379; font-size:13px }
.work-result { display:flex; align-items:center; gap:10px; min-height:48px; line-height:1.4 }
.kind { flex:none; padding:3px 6px; border-radius:5px; font-size:12px; color:#1956ae; background:#ebf3ff }
.kind.quotation { color:#326748; background:#e9f5ee }
.summary { flex:1; min-width:0 }
.summary strong,.summary small { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.summary strong { font-size:14px; color:#21344e }
.summary small,.state { color:#617288; font-size:12px }
.state { flex:none }
</style>
