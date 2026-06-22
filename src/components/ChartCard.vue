<template>
  <div ref="el" :style="{ height: height + 'px', width: '100%' }"></div>
</template>

<script setup>
import * as echarts from 'echarts'
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const props = defineProps({
  option: { type: Object, default: () => ({}) },
  height: { type: Number, default: 300 }
})

const el = ref(null)
let chart = null
let ro = null

function ensure() {
  if (!chart && el.value && el.value.clientWidth > 0 && el.value.clientHeight > 0) {
    chart = echarts.init(el.value)
  }
  return chart
}
function render() {
  const c = ensure()
  if (c) c.setOption(props.option, true)
}
function onResize() {
  if (!chart) render()
  else chart.resize()
}

// 容器挂载时宽度可能为 0（首屏/动画/异常环境），轮询兜底直到拿到尺寸
function tryInit(retries = 30) {
  if (render() || chart) return
  if (retries > 0) setTimeout(() => tryInit(retries - 1), 100)
}

onMounted(() => {
  nextTick(() => {
    tryInit()
    window.addEventListener('resize', onResize)
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize)
      ro.observe(el.value)
    }
  })
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  ro && ro.disconnect()
  ro = null
  chart && chart.dispose()
  chart = null
})
</script>
