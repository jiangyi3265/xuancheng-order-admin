// 改状态的统一入口：把项目改成「已完成」且还有欠款时，顺手弹窗问一句“这单收到钱了吗”，
// 一键收清，不用再另外打开收款窗口。弹窗本身是 SettleDialog.vue，挂在整体布局里。
import { reactive } from 'vue'
import { setStatus } from '@/mock/store'
import { owed } from '@/utils/payment'

export const settlePrompt = reactive({ visible: false, order: null })

export async function changeOrderStatus(order, status) {
  const before = order?.status
  const vo = await setStatus(order.id, status)
  if (status === 'done' && before !== 'done' && Number(vo?.amount) > 0 && owed(vo) > 0) {
    settlePrompt.order = vo
    settlePrompt.visible = true
  }
  return vo
}
