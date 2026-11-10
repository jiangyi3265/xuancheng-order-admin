// 统一处理项目状态和完成时的收款询问。
import { reactive } from 'vue'
import { orders, setStatus, token } from '@/mock/store'
import { statusMap } from '@/constants/options'
import { owed } from '@/utils/payment'
import { offerOrderUndo } from '@/utils/orderUndo'

export const settlePrompt = reactive({ visible: false, order: null })
let afterSettlement

export function finishSettlement() {
  if (!afterSettlement) return
  const offer = afterSettlement
  afterSettlement = undefined
  offer()
}

export async function changeOrderStatus(order, status, message = '') {
  const before = order.status
  const id = order.id
  if (before === status) return order
  const session = token.value
  const vo = await setStatus(id, status)
  const received = Number(vo?.receivedAmount || 0)
  const eligible = cur => cur.status === status && (status !== 'done' || Number(cur.receivedAmount || 0) === received)
  const offer = () => {
    if (token.value !== session) return
    offerOrderUndo(id, 'status', message || '「' + order.title + '」已设为' + statusMap[status].label,
      eligible, () => setStatus(id, before))
  }
  if (status === 'done' && Number(vo?.amount) > 0 && owed(vo) > 0) {
    settlePrompt.order = vo
    afterSettlement = () => {
      const current = orders.find(row => row.id === id)
      if (current && eligible(current)) offer()
    }
    settlePrompt.visible = true
  } else {
    offer()
  }
  return vo
}
