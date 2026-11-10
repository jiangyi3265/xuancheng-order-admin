// 小表单里的两个省事细节：打开就能打字、填完按回车就提交。
import { unref } from 'vue'
import { isMobile } from '@/utils/useMobile'

// 回车提交。正在用输入法选字时的回车不算（那是在确认候选词，不是要提交）
export const onEnter = (fn) => (e) => {
  if (e?.isComposing || e?.keyCode === 229) return
  fn()
}

// 弹窗打开后把光标放进第一栏。手机上不自动弹键盘（会把窗口顶上去挡住内容）
// 模板里传进来的 ref 已经被自动解开了，脚本里传的还是 ref，两种都认
export function focusField(field) {
  if (!isMobile.value) unref(field)?.focus?.()
}
