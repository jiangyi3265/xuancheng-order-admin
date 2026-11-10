<template>
  <Teleport to="body">
    <dialog ref="dialog" aria-label="圈注图片" class="annotation-editor" @cancel.prevent="closeEditor" @keydown="onShortcut" @paste.stop.prevent>
      <header class="annotation-header">
        <div class="annotation-title"><h2>圈注图片</h2><span :title="item.name">{{ item.name || '截图' }}</span></div>
        <button type="button" class="annotation-cancel" :disabled="locked" @click="closeEditor">取消</button>
      </header>

      <div class="annotation-tools" role="group" aria-label="圈注工具">
        <div class="tool-group">
          <button v-for="option in tools" :key="option.key" type="button" :aria-label="option.label"
            :aria-pressed="tool === option.key" :disabled="locked" @click="selectTool(option.key)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse v-if="option.key==='ellipse'" cx="12" cy="12" rx="8.2" ry="6.4" />
              <path v-else-if="option.key==='arrow'" d="M4 19 19 4 M8 4h11v11" />
              <path v-else d="M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3" />
            </svg>
            {{ option.label }}
          </button>
        </div>
        <button type="button" class="annotation-undo" :disabled="locked || (!marks.length && !draft)" @click="undo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5-5 5 5 5 M4 10h10a6 6 0 0 1 0 12" transform="translate(0 -2)" /></svg>撤销
        </button>
      </div>

      <div ref="stage" class="annotation-stage">
        <div class="annotation-sheet">
          <div ref="surface" class="annotation-surface" :class="{'move-mode':tool==='move'}" :style="surfaceStyle"
            :tabindex="ready ? 0 : -1" role="group" aria-label="图片圈注画布" @pointerdown="begin" @pointermove="drag"
            @pointerup="finish" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer"
            @keydown="keyboardDraw">
            <img ref="picture" :key="loadKey" :src="item.url" :alt="item.name || '待圈注的图片'" draggable="false"
              @load="imageLoaded" @error="loadFailed=true" />
            <svg v-if="ready" class="annotation-marks" :viewBox="'0 0 '+natural.w+' '+natural.h" preserveAspectRatio="none" aria-hidden="true">
              <g v-for="(mark, i) in shownMarks" :key="i" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path :d="annotationPath(mark)" stroke="white" :stroke-width="mark.weight*1.55" />
                <path :d="annotationPath(mark)" :stroke="ink" :stroke-width="mark.weight" />
              </g>
            </svg>
            <i v-if="cursor" class="key-cursor" aria-hidden="true" :style="{left:100*cursor.x/natural.w+'%',top:100*cursor.y/natural.h+'%'}"></i>
          </div>
          <div v-if="!ready" class="stage-message" role="status">{{ loadFailed ? '图片加载失败' : '正在加载图片…' }}
            <button v-if="loadFailed" type="button" @click="retryImage">重新加载</button>
          </div>
        </div>
      </div>

      <div class="annotation-view-controls" role="group" aria-label="画布缩放">
        <button type="button" aria-label="缩小画布" title="缩小" :disabled="!ready || !!draft || locked || scale<=fitScale" @click="resizeView(scale/1.65)">−</button>
        <output aria-label="缩放比例">{{ ready ? Math.round(scale*100)+'%' : '—' }}</output>
        <button type="button" aria-label="放大画布" title="放大" :disabled="!ready || !!draft || locked || scale>=maxScale" @click="resizeView(scale*1.65)">＋</button>
        <button type="button" class="view-preset" :disabled="!ready || !!draft || locked" @click="resizeView(isFit && widthScale>fitScale+.001 ? widthScale : 0)">
          {{ isFit && widthScale>fitScale+.001 ? '适合宽度' : '显示全图' }}
        </button>
      </div>
      <footer class="annotation-footer">
        <span v-if="error || saveError" role="alert" class="annotation-error">{{ error || saveError }}</span>
        <span v-else class="annotation-help">{{ help }}</span>
        <button type="button" class="save-annotation" :disabled="!ready || !marks.length || !!draft || locked" @click="save">
          {{ locked ? '正在保存…' : '保存圈注' }}
        </button>
      </footer>
    </dialog>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { annotationPath, ink, renderAnnotationFile } from '@/customer/utils/imageAnnotations'

const props = defineProps({
  item:{type:Object, required:true},
  busy:{type:Boolean, default:false},
  error:{type:String, default:''}
})
const emit = defineEmits(['close','save'])
const tools = [{key:'ellipse',label:'画圈'},{key:'arrow',label:'箭头'},{key:'move',label:'移动'}]
const dialog = ref(null), stage = ref(null), surface = ref(null), picture = ref(null)
const tool = ref('ellipse'), loadKey = ref(0), loadFailed = ref(false), saveError = ref('')
const exporting = ref(false)
const locked = computed(() => props.busy || exporting.value)
const natural = ref({w:0,h:0}), viewport = ref({w:0,h:0}), zoom = ref(0)
const ready = computed(() => !loadFailed.value && natural.value.w>0 && viewport.value.w>0)
const widthScale = computed(() => ready.value ? viewport.value.w/natural.value.w : 1)
const fitScale = computed(() => ready.value ? Math.min(1, widthScale.value, viewport.value.h/natural.value.h) : 1)
const maxScale = computed(() => Math.max(4, widthScale.value))
const scale = computed(() => Math.max(fitScale.value, Math.min(zoom.value, maxScale.value)))
const isFit = computed(() => Math.abs(scale.value-fitScale.value)<.00001)
const surfaceStyle = computed(() => ({
  width:(ready.value ? natural.value.w*scale.value : 0)+'px',
  height:(ready.value ? natural.value.h*scale.value : 0)+'px'
}))
const marks = shallowRef([]), draft = shallowRef(null), cursor = shallowRef(null)
const shownMarks = computed(() => draft.value ? [...marks.value,draft.value] : marks.value)
const help = computed(() => {
  if (cursor.value) return '方向键定位，回车确定起点和终点，Esc 取消当前标记'
  if (tool.value==='move') return '拖动图片，查看其他位置'
  if (marks.value.length) return '可继续添加标记，保存后以静态图片发送'
  if (ready.value && isFit.value && widthScale.value > fitScale.value * 2.5) return '长截图可先点「适合宽度」，再拖动标记'
  return tool.value==='ellipse' ? '在截图上按住并拖动，圈出要调整的位置' : '从起点拖向要指出的位置'
})
let gesture, observer, mounted = true

function measure() {
  if (stage.value) viewport.value = {w:Math.max(1,stage.value.clientWidth-24), h:Math.max(1,stage.value.clientHeight-24)}
}
function imageLoaded(event) {
  natural.value = {w:event.target.naturalWidth,h:event.target.naturalHeight}
  loadFailed.value = false
}
function retryImage() {
  loadFailed.value = false
  natural.value = {w:0,h:0}
  loadKey.value++
}
async function resizeView(value) {
  if (draft.value || !ready.value) return
  const box = stage.value.getBoundingClientRect()
  const area = surface.value.getBoundingClientRect()
  const center = {x:box.left+stage.value.clientWidth/2,y:box.top+stage.value.clientHeight/2}
  const u = (center.x-area.left)/area.width, v = (center.y-area.top)/area.height
  zoom.value = value
  await nextTick()
  if (!surface.value) return
  const resized = surface.value.getBoundingClientRect()
  stage.value.scrollLeft += resized.left + resized.width*u - center.x
  stage.value.scrollTop += resized.top + resized.height*v - center.y
}
function clamp(value, max) { return Math.max(0, Math.min(max,value)) }
function coordinates(event) {
  const rect = surface.value.getBoundingClientRect()
  return {x:clamp((event.clientX-rect.left)*natural.value.w/rect.width,natural.value.w),
    y:clamp((event.clientY-rect.top)*natural.value.h/rect.height,natural.value.h)}
}
function makeMark(start) {
  const shortSide = Math.min(natural.value.w,natural.value.h)
  const weight = Math.max(.7, Math.min(shortSide*.018, Math.max(shortSide*.003, 3.5/scale.value)))
  return {tool:tool.value, start, end:start, weight}
}
function commit() {
  const mark = draft.value
  if (!mark) return
  const dx = Math.abs(mark.end.x-mark.start.x)*scale.value, dy = Math.abs(mark.end.y-mark.start.y)*scale.value
  if (mark.tool==='ellipse' ? Math.min(dx,dy)>=2 : Math.hypot(dx,dy)>=4) marks.value = [...marks.value,mark]
  draft.value = null
}
function clearGesture() {
  const id = gesture?.id
  gesture = null
  draft.value = null
  if (id!=null && surface.value?.hasPointerCapture(id)) surface.value.releasePointerCapture(id)
}
function begin(event) {
  if (!ready.value || locked.value || event.button !== 0 || gesture || event.isPrimary === false) return
  event.preventDefault()
  surface.value.focus({preventScroll:true})
  cursor.value = null
  saveError.value = ''
  gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, left:stage.value.scrollLeft, top:stage.value.scrollTop}
  surface.value.setPointerCapture(event.pointerId)
  if (tool.value!=='move') draft.value = makeMark(coordinates(event))
}
function drag(event) {
  if (gesture?.id !== event.pointerId) return
  if (tool.value==='move') {
    stage.value.scrollLeft = gesture.left - (event.clientX-gesture.x)
    stage.value.scrollTop = gesture.top - (event.clientY-gesture.y)
  } else if (draft.value) draft.value = {...draft.value, end:coordinates(event)}
}
function finish(event) {
  if (gesture?.id !== event.pointerId) return
  drag(event)
  commit()
  clearGesture()
}
function cancelPointer(event) {
  if (gesture?.id === event.pointerId) clearGesture()
}
function selectTool(value) {
  clearGesture()
  cursor.value = null
  tool.value = value
}
function undo() {
  if (locked.value) return
  if (draft.value) clearGesture()
  else marks.value = marks.value.slice(0,-1)
}
function closeEditor() {
  if (!locked.value) emit('close')
}
function keyboardDraw(event) {
  if (locked.value || !ready.value || gesture || tool.value==='move') return
  const steps = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}
  if (!(event.key in steps) && event.key!=='Enter' && event.key!==' ') return
  event.preventDefault()
  event.stopPropagation()
  const p = cursor.value || {x:natural.value.w/2,y:natural.value.h/2}
  if (steps[event.key]) {
    const [dx,dy] = steps[event.key]
    const step = (event.shiftKey ? 15 : 4)/scale.value
    cursor.value = {x:clamp(p.x+dx*step,natural.value.w),y:clamp(p.y+dy*step,natural.value.h)}
    if (draft.value) draft.value = {...draft.value,end:cursor.value}
    nextTick(() => surface.value?.querySelector('.key-cursor')?.scrollIntoView({block:'nearest',inline:'nearest'}))
  } else if (!event.repeat) {
    cursor.value = p
    if (draft.value) commit()
    else draft.value = makeMark(p)
  }
}
function onShortcut(event) {
  event.stopPropagation()
  if (event.key==='Escape' && draft.value) {
    event.preventDefault()
    clearGesture()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='z') {
    event.preventDefault()
    undo()
  }
}
async function save() {
  if (locked.value || draft.value || !marks.value.length || !ready.value) return
  exporting.value = true
  saveError.value = ''
  try {
    const file = await renderAnnotationFile(picture.value,marks.value,props.item.name)
    if (mounted) emit('save', file)
  } catch (e) {
    if (mounted) saveError.value = e.name==='SecurityError' ? '无法读取原图，请重新上传截图后再圈注' : (e.message || '圈注生成失败，请重试')
  } finally {
    exporting.value = false
  }
}
onMounted(() => {
  dialog.value.showModal()
  measure()
  if (typeof ResizeObserver!=='undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(stage.value)
  }
  window.addEventListener('resize',measure)
})
onBeforeUnmount(() => {
  mounted = false
  observer?.disconnect()
  window.removeEventListener('resize',measure)
  dialog.value?.close()
})
</script>

<style scoped>
.annotation-editor {
  --edge:#dce4ef; --text:#18253c; --muted:#53657b; --blue:#225de1;
  box-sizing:border-box; width:min(950px,calc(100vw - 40px)); height:min(800px,calc(100vh - 46px));
  height:min(800px,calc(100dvh - 46px)); max-width:100%; max-height:100%; padding:0;
  overflow:hidden; border:1px solid #d7e0ed; border-radius:18px; color:var(--text); background:white;
  box-shadow:0 24px 80px #172b4555; font-family:inherit;
}
.annotation-editor[open] {display:flex; flex-direction:column}
.annotation-editor::backdrop {background:rgb(16 28 46 / 65%)}
.annotation-header,.annotation-tools,.annotation-view-controls,.annotation-footer {display:flex;align-items:center;flex:none;padding-inline:clamp(12px,3vw,24px)}
.annotation-header {padding-block:12px; justify-content:space-between; gap:12px; border-bottom:1px solid var(--edge)}
.annotation-title {display:flex; flex-direction:column; gap:1px; min-width:0}
.annotation-title h2 {margin:0; font-size:18px; line-height:1.4}
.annotation-title span {font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.annotation-editor button {appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:0 12px;
  min-height:36px; border:1px solid transparent; border-radius:8px; color:#34455d; background:transparent;
  line-height:1.25; font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap}
.annotation-editor button:focus-visible,.annotation-surface:focus-visible {outline:2px solid #2968e6;outline-offset:-2px}
.annotation-editor button:hover:not(:disabled) {background:#eff4fb}
.annotation-editor button:disabled {opacity:.45; cursor:default}
.annotation-editor .annotation-cancel {border-color:var(--edge);font-weight:500}
.annotation-tools {padding-block:8px; gap:8px;justify-content:space-between}
.tool-group {display:flex;align-items:center; padding:2px; gap:2px; background:#f3f6fb;border-radius:10px}
.annotation-editor .tool-group button[aria-pressed=true] {background:white;color:#154da9; border-color:#d4e0f2; box-shadow:0 1px 3px #152d5017}
.annotation-tools svg {width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.annotation-stage {flex:1 1 0; min-height:0; overflow:auto; overscroll-behavior:contain; background:#e9eef5; border-block:1px solid var(--edge); position:relative}
.annotation-sheet {position:relative;box-sizing:border-box;display:grid;place-content:center;min-width:100%;min-height:100%;width:max-content;height:max-content;padding:12px}
.annotation-surface {position:relative; touch-action:none; cursor:crosshair; box-shadow:0 1px 8px #16294224;background:white;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.annotation-surface.move-mode {cursor:grab}
.annotation-surface.move-mode:active {cursor:grabbing}
.annotation-surface img,.annotation-marks {position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;max-height:none;pointer-events:none}
.key-cursor {position:absolute;transform:translate(-50%,-50%);width:10px;height:10px;border:2px solid #1c55c6;outline:1px solid white;border-radius:50%;pointer-events:none}
.stage-message {position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--muted);font-size:14px}
.annotation-editor .stage-message button {background:white;color:var(--blue);border-color:var(--edge)}
.annotation-view-controls {justify-content:center;gap:3px;min-height:42px;background:#f7f9fc;border-bottom:1px solid var(--edge)}
.annotation-view-controls output {min-width:42px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted)}
.annotation-view-controls button {min-width:36px;min-height:32px;padding:0 8px;font-size:18px}
.annotation-view-controls .view-preset {font-size:13px;font-weight:500;border-left:1px solid var(--edge);border-radius:0;margin-left:5px;padding-inline:12px}
.annotation-footer {justify-content:space-between;gap:14px;padding-block:12px}
.annotation-footer span {font-size:13px; line-height:1.45; color:var(--muted);overflow-wrap:anywhere}
.annotation-footer .annotation-error {color:#b32e39}
.annotation-editor .save-annotation {color:white;background:var(--blue);min-height:40px;padding-inline:18px;flex:none}
.annotation-editor .save-annotation:hover:not(:disabled) {background:#194dc1}
@media(max-width:640px),(max-height:540px) {
  .annotation-editor {width:100%; height:100vh; height:100dvh; max-height:none;margin:0; border-radius:0;border:0;
    padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
  .annotation-header {padding-block:8px}
  .annotation-tools {gap:4px;padding-block:6px}
  .annotation-tools button {padding-inline:8px;min-height:38px;font-size:13px}
  .annotation-footer {padding-block:9px;gap:8px}
  .annotation-footer span {font-size:12px}
}
@media(max-height:450px) {
  .annotation-header {padding-block:4px}.annotation-title {flex-direction:row;align-items:baseline;gap:8px}
  .annotation-tools {padding-block:3px}.annotation-view-controls {min-height:30px}.annotation-footer {padding-block:4px}
  .annotation-tools button,.annotation-header button,.annotation-footer .save-annotation {min-height:30px}
}
</style>
