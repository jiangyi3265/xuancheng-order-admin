<template>
  <span v-if="cover && !failed" class="project-cover" :class="{compact}" tabindex="0" role="button"
    :aria-label="'放大图片：' + order.title" @click.stop="enlarge" @keydown.enter.stop.prevent="enlarge" @keydown.space.stop.prevent="enlarge">
    <img :src="cover" alt="项目附件预览" loading="lazy" @error="failed=true"/>
  </span>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { openImage } from '@/utils/imagePreview'
import { adminHttp, customerHttp } from '@/mock/store'

const props = defineProps({order: {type:Object, required:true}, compact:Boolean})
const route = useRoute()
const failed = ref(false)
const legacyCover = ref('')
function firstImage(order) {
  return order?.attachments?.find(a => typeof a?.url === 'string' &&
    (/^data:image\//i.test(a.url) || ((/^\/(?!\/)/.test(a.url) && !a.url.includes('\\')) &&
      (a.type === 'image' || String(a.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(a.url)))))?.url || ''
}
const cover = computed(() => props.order.coverUrl === '@inline'
  ? (legacyCover.value || firstImage(props.order))
  : ('coverUrl' in props.order ? props.order.coverUrl : firstImage(props.order)))
watch(cover, () => { failed.value = false })
watch([() => props.order.id, () => props.order.coverUrl], async ([id, url], _, onCleanup) => {
  legacyCover.value = ''
  if (url !== '@inline' || firstImage(props.order)) return
  let active = true
  onCleanup(() => { active = false })
  try {
    const detail = route.meta.customer ? await customerHttp('/jiedan/portal/orders/' + id) : await adminHttp('/jiedan/order/' + id)
    if (active) legacyCover.value = firstImage(detail)
  } catch { /* The project card remains usable when an old attachment is unavailable. */ }
}, { immediate:true })
function enlarge() { openImage(cover.value, props.order.title) }
</script>

<style scoped>
.project-cover{display:block;height:160px;border-radius:12px;overflow:hidden;background:#e9eef5;flex:none;cursor:zoom-in}
.project-cover.compact{width:88px;height:88px}
.project-cover img{display:block;width:100%;height:100%;object-fit:cover}
</style>
