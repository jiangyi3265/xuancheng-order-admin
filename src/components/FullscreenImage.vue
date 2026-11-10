<template>
  <Teleport to="body">
    <dialog ref="dialog" class="fullscreen-image" :aria-label="previewImage?.name || '图片预览'"
      @keydown.left="galleryKey($event, -1)" @keydown.right="galleryKey($event, 1)"
      @cancel.prevent="close" @keydown.esc.stop.prevent="close">
      <template v-if="previewImage">
        <header class="preview-header">
          <span class="image-title">{{ previewImage.name }}<small v-if="previewImage.context">{{ previewImage.context }}</small></span>
          <b v-if="hasGallery" class="gallery-count" aria-live="polite">{{ previewImage.index + 1 }} / {{ previewImage.gallery.length }}</b>
          <button v-if="previewImage.file" type="button" @click="downloadAttachment(previewImage.file)">下载文件</button>
          <button type="button" aria-label="关闭图片预览" @click="close">关闭</button>
        </header>
        <div class="preview-workspace">
          <div ref="stage" class="image-stage" :class="{'can-swipe': canSwipe}"
            @touchstart.passive="startSwipe" @touchend="endSwipe" @touchcancel="swipeStart=null" tabindex="0" autofocus aria-label="预览图片，可滚动查看">
            <div class="image-canvas" @pointerdown="startGesture" @pointermove="moveGesture"
              @pointercancel="cancelGesture" @click="dismissOnTap">
              <div v-if="failed" class="image-error">
                <span role="status">图片加载失败</span>
                <button type="button" @click.stop="failed = false">重新加载</button>
              </div>
              <img v-else-if="previewImage.url" :key="previewImage.url" ref="picture"
                :src="previewImage.url" :alt="previewImage.name" :style="pictureSize" draggable="false"
                @load="measurePicture" @error="imageFailed" />
              <div v-else ref="picture" class="image-crop" :style="[previewImage.crop, pictureSize]"
                role="img" :aria-label="previewImage.name" />
              <span v-if="previewImage.url && !ready && !failed" class="image-loading" role="status">正在加载图片…</span>
            </div>
          </div>
          <template v-if="hasGallery">
            <button type="button" class="gallery-arrow previous" aria-label="上一张图片"
              :disabled="previewImage.index === 0" @click="moveImage(-1)"><el-icon><ArrowLeft /></el-icon></button>
            <button type="button" class="gallery-arrow next" aria-label="下一张图片"
              :disabled="previewImage.index === previewImage.gallery.length-1" @click="moveImage(1)"><el-icon><ArrowRight /></el-icon></button>
          </template>
        </div>
        <div v-if="!failed" class="preview-controls" role="group" aria-label="图片缩放">
          <button type="button" aria-label="查看整图" :disabled="!ready" @click="setMode('fit')">整图</button>
          <button type="button" aria-label="适应宽度" :disabled="!ready" @click="setMode('width')">适宽</button>
          <button type="button" aria-label="缩小图片" :disabled="!ready || scale <= minScale" @click="zoomBy(1 / 1.5)">−</button>
          <span v-if="previewImage.url && ready && !loaded" class="scale" role="status">加载中…</span>
          <span v-else class="scale">{{ ready ? Math.round(scale * 100) + '%' : '…' }}</span>
          <button type="button" aria-label="放大图片" :disabled="!ready || scale >= maxScale" @click="zoomBy(1.5)">＋</button>
        </div>
      </template>
    </dialog>
  </Teleport>
</template>

<script setup>
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { computed, nextTick, ref, watch } from 'vue'
import { moveImage, previewImage } from '@/utils/imagePreview'
import { downloadAttachment } from '@/utils/file'

const dialog = ref(null)
const stage = ref(null)
const picture = ref(null)
const natural = ref({ width: 0, height: 0 })
const viewport = ref({ width: 0, height: 0 })
const mode = ref('fit')
const manualScale = ref(1)
const failed = ref(false)
const loaded = ref(false)
const ready = computed(() => natural.value.width > 0 && natural.value.height > 0 && viewport.value.width > 0 && viewport.value.height > 0)
const widthScale = computed(() => ready.value ? viewport.value.width / natural.value.width : 1)
const fitScale = computed(() => ready.value ? Math.min(widthScale.value, viewport.value.height / natural.value.height, previewImage.value?.crop ? Infinity : 1) : 1)
const minScale = computed(() => fitScale.value / 2)
const maxScale = computed(() => Math.max(4, fitScale.value * 4, widthScale.value))
const scale = computed(() => {
  if (mode.value === 'manual') return Math.max(minScale.value, Math.min(maxScale.value, manualScale.value))
  if (mode.value === 'width') return widthScale.value
  return fitScale.value
})
const pictureSize = computed(() => ready.value ? {
  width: Math.round(natural.value.width * scale.value) + 'px',
  height: Math.round(natural.value.height * scale.value) + 'px'
} : { maxWidth: viewport.value.width + 'px', maxHeight: viewport.value.height + 'px', objectFit: 'contain' })

const hasGallery = computed(() => (previewImage.value?.gallery?.length || 0) > 1)
const canSwipe = computed(() => hasGallery.value && scale.value <= fitScale.value)
let swipeStart = null
function startSwipe(event) {
  const touch = event.touches[0]
  swipeStart = canSwipe.value && event.touches.length === 1 ? {x:touch.clientX, y:touch.clientY} : null
}
function endSwipe(event) {
  if (!swipeStart || !canSwipe.value) return
  const touch = event.changedTouches[0]
  const dx = touch.clientX - swipeStart.x, dy = touch.clientY - swipeStart.y
  swipeStart = null
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  if (event.cancelable) event.preventDefault()
  moveImage(dx < 0 ? 1 : -1)
}
function galleryKey(event, offset) {
  if (!hasGallery.value || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  event.stopPropagation()
  event.preventDefault()
  moveImage(offset)
}
function close() { previewImage.value = null }
function measure() {
  if (stage.value) viewport.value = { width: stage.value.clientWidth, height: stage.value.clientHeight }
}
function measurePicture() {
  const image = picture.value
  if (image?.complete && image.naturalWidth) loaded.value = true
  if (image?.naturalWidth && image.naturalHeight &&
      (image.naturalWidth !== natural.value.width || image.naturalHeight !== natural.value.height)) {
    natural.value = { width: image.naturalWidth, height: image.naturalHeight }
  }
}
function imageFailed(event) {
  if (event.currentTarget === picture.value) {
    natural.value = { width: 0, height: 0 }
    loaded.value = false
    failed.value = true
  }
}
// The browser can paint part of an image before its load event. Size that first
// frame as soon as its intrinsic dimensions arrive, including on a retry.
watch(picture, (image, _, onCleanup) => {
  if (image?.tagName !== 'IMG') return
  measurePicture()
  if (typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(measurePicture)
  observer.observe(image)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
watch(previewImage, async (value, previous, onCleanup) => {
  let stale = false
  let observer
  onCleanup(() => { stale = true; observer?.disconnect() })
  natural.value = { width: 0, height: 0 }
  viewport.value = { width: 0, height: 0 }
  mode.value = 'fit'
  failed.value = false
  loaded.value = false
  gesture = null
  swipeStart = null
  if (!value) {
    dialog.value?.close()
    return
  }
  await nextTick()
  if (stale || !stage.value) return
  if (!dialog.value.open) dialog.value.showModal()
  if (value.crop) {
    const [width, height] = value.crop.aspectRatio.split('/').map(Number)
    natural.value = { width, height }
  } else measurePicture()
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(stage.value)
  }
  stage.value.scrollTo(0, 0)
  if (value.gallery && previous) stage.value.focus({preventScroll:true})
})

async function setMode(value) {
  mode.value = value
  await nextTick()
  stage.value?.scrollTo(0, 0)
}
async function zoomBy(factor) {
  const frame = stage.value
  const image = picture.value
  if (!ready.value || !frame || !image) return
  const frameRect = frame.getBoundingClientRect()
  const before = image.getBoundingClientRect()
  const x = frameRect.left + frame.clientWidth / 2
  const y = frameRect.top + frame.clientHeight / 2
  const relativeX = (x - before.left) / before.width
  const relativeY = (y - before.top) / before.height
  manualScale.value = Math.max(minScale.value, Math.min(maxScale.value, scale.value * factor))
  mode.value = 'manual'
  await nextTick()
  if (image !== picture.value) return
  const after = image.getBoundingClientRect()
  frame.scrollBy(after.left + relativeX * after.width - x, after.top + relativeY * after.height - y)
}

let gesture = null
function startGesture(event) {
  if (event.button !== 0 || !event.isPrimary) { cancelGesture(); return }
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.value.scrollLeft, top: stage.value.scrollTop, moved: false }
}
function moveGesture(event) {
  if (!gesture || gesture.id !== event.pointerId || !event.buttons) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!gesture.moved && Math.hypot(dx, dy) < 6) return
  gesture.moved = true
  if (event.pointerType === 'mouse') {
    event.currentTarget.setPointerCapture(event.pointerId)
    stage.value.scrollTo(gesture.left - dx, gesture.top - dy)
  }
}
function cancelGesture() { if (gesture) gesture.moved = true }
function dismissOnTap() {
  if (!gesture?.moved) close()
  gesture = null
}
</script>

<style scoped>
dialog.fullscreen-image {
  position: fixed; inset: 0; box-sizing: border-box; width: 100vw; height: 100vh; height: 100dvh;
  max-width: none; max-height: none; margin: 0; border: 0; padding: 0; overflow: hidden;
  background: #101318; color: white;
}
.fullscreen-image[open] { display: flex; flex-direction: column }
.fullscreen-image::backdrop { background: #101318 }
.preview-header, .preview-controls { display: flex; flex: none; align-items: center; gap: 8px; background: #191e27 }
.preview-header {
  padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left));
}
.preview-header span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fullscreen-image button {
  min-width: 38px; min-height: 36px; padding: 4px 10px; border-radius: 7px; border: 1px solid #647080;
  background: #28313f; color: white; font: inherit; font-size: 14px; white-space: nowrap; cursor: pointer;
}
.fullscreen-image button:disabled { opacity: .45; cursor: default }
.image-stage {
  flex: 1; min-width: 0; min-height: 0; width: 100%; overflow: auto; overscroll-behavior: contain;
  touch-action: pan-x pan-y pinch-zoom; -webkit-overflow-scrolling: touch;
}
.image-stage:focus-visible { outline: 2px solid #7eb4ff; outline-offset: -2px }
.image-canvas {
  position: relative;
  display: grid; place-items: center; width: max-content; min-width: 100%; min-height: 100%;
  cursor: zoom-out; user-select: none; -webkit-user-select: none;
}
.image-canvas img, .image-crop { display: block; max-width: none; max-height: none }
.image-loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 8px 14px; border-radius: 8px; background: #252f3d; white-space: nowrap; pointer-events: none }
.image-error { display: flex; align-items: center; gap: 12px }
.image-crop { background-repeat: no-repeat }
.preview-controls {
  justify-content: center; padding: 6px max(8px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
}
.scale { min-width: 45px; text-align: center; font-size: 13px; font-variant-numeric: tabular-nums }
.preview-workspace {position:relative;display:flex;flex:1;min-height:0}
.image-stage.can-swipe {touch-action:pan-y pinch-zoom}
.image-title small {display:block;color:#bfd0e8;font-weight:400;font-size:12px;line-height:1.5}
.gallery-count {flex:none;font-size:13px;color:#d7e6fc;font-variant-numeric:tabular-nums;white-space:nowrap}
.fullscreen-image .gallery-arrow {position:absolute;top:50%;transform:translateY(-50%);display:grid;place-items:center;border:1px solid #ffffff60;border-radius:50%;background:#172338d9;box-shadow:0 2px 12px #0002;width:44px;height:44px;padding:0;font-size:20px}
.gallery-arrow.previous {left:max(8px,env(safe-area-inset-left))}.gallery-arrow.next {right:max(8px,env(safe-area-inset-right))}
.fullscreen-image .gallery-arrow:disabled {opacity:.34}
</style>
