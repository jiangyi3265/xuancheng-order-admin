<template><span><template v-for="(part, i) in parts" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer" @click.stop @keydown.stop>{{ part.text }}</a><template v-else>{{ part.text }}</template></template></span></template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ text: { type: String, default: '' } })

const parts = computed(() => {
  const text = props.text || ''
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`，。！？、；：）】》]+/gi)) {
    let href = match[0].replace(/[.,!?;:]+$/, '')
    if (href.endsWith(')') && href.split(')').length > href.split('(').length) href = href.slice(0, -1)
    try { new URL(href) } catch { continue }
    parts.push({ text: text.slice(cursor, match.index) }, { text: href, href })
    cursor = match.index + href.length
  }
  parts.push({ text: text.slice(cursor) })
  return parts
})
</script>
<style scoped>a { color:var(--el-color-primary,#165dff); overflow-wrap:anywhere; text-decoration:underline; }</style>
