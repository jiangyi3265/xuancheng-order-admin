<template>
  <div class="voice-recorder">
    <!-- 空闲：麦克风按钮 -->
    <el-button
      v-if="!recording"
      circle
      :icon="Microphone"
      title="按一下开始录音"
      @click="start"
    />

    <!-- 录音中：计时 + 停止/取消 -->
    <div v-else class="recording">
      <span class="dot"></span>
      <span class="time">{{ elapsedText }}</span>
      <!-- computed，直接插值 -->
      <el-button size="small" type="danger" plain @click="cancel">取消</el-button>
      <el-button size="small" type="primary" @click="stop">完成</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { Microphone } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['recorded'])

const recording = ref(false)
const elapsed = ref(0)
let mediaRecorder = null
let stream = null
let chunks = []
let timer = null
let aborted = false

const elapsedText = computed(() => {
  const s = elapsed.value
  const m = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
})

function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

async function start() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return ElMessage.error('当前浏览器不支持录音（请用手机浏览器或 Chrome）')
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    return ElMessage.error('无法访问麦克风，请检查权限设置')
  }
  aborted = false
  chunks = []
  const mime = pickMime()
  try {
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  } catch (e) {
    cleanup()
    return ElMessage.error('录音初始化失败：' + e.message)
  }
  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }
  mediaRecorder.onstop = onStop
  mediaRecorder.start()
  recording.value = true
  elapsed.value = 0
  timer = setInterval(() => {
    elapsed.value += 1
    if (elapsed.value >= 120) stop() // 最长 2 分钟
  }, 1000)
}

function stop() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
}

function cancel() {
  aborted = true
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
}

function onStop() {
  const duration = elapsed.value
  const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' })
  cleanup()
  if (aborted || duration < 1 || blob.size === 0) return
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type })
  emit('recorded', {
    name: `语音 ${elapsedFmt(duration)}`,
    file,
    type: 'audio',
    size: blob.size,
    duration
  })
}

function elapsedFmt(s) {
  return `${s}"`
}

function cleanup() {
  recording.value = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
  mediaRecorder = null
  chunks = []
}

onBeforeUnmount(cleanup)
</script>

<style scoped>
.voice-recorder {
  display: inline-flex;
  align-items: center;
}
.recording {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #fef0f0;
  border-radius: 20px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #f56c6c;
  animation: blink 1s infinite;
}
.time {
  font-variant-numeric: tabular-nums;
  color: #f56c6c;
  font-size: 13px;
  min-width: 40px;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
