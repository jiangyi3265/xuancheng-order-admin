import { ref } from 'vue'

// 手机宽度（和样式里的 768px 断点一致）。整个应用共用一个监听，窗口大小变化时自动更新。
// 只有“手机上要渲染不同的结构”时才用它；纯样式差异请直接写 @media (max-width: 768px)。
const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 768px)') : null

export const isMobile = ref(!!query && query.matches)

if (query) {
  const onChange = (e) => {
    isMobile.value = e.matches
  }
  if (query.addEventListener) query.addEventListener('change', onChange)
  else query.addListener(onChange)
}
