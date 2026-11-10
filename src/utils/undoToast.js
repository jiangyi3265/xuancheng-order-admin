import { h, watch } from 'vue'
import { toast } from '@/utils/toast'
import { token } from '@/mock/store'

// A newer operation on the same field replaces the older offer. Each button is single use.
const offers = new Map()

export function undoToast(key, message, rollback) {
  offers.get(key)?.close()
  const session = token.value
  let used = false
  async function undo(event) {
    if (used || session !== token.value) return
    used = true
    event.currentTarget.disabled = true
    event.currentTarget.textContent = '撤销中…'
    offer.close()
    try {
      await rollback()
      if (session === token.value) toast.success('已撤销')
    } catch (error) {
      if (session === token.value) toast.error('撤销失败：' + (error.message || '请刷新后重试'))
    }
  }
  const offer = toast({
    type: 'success', duration: 6000, actionable: true,
    message: h('span', [message, h('button', {
      type: 'button', class: 'el-button el-button--primary is-link', style: 'margin-left:12px', onClick: undo
    }, '撤销')]),
    onClose: () => { if (offers.get(key) === offer) offers.delete(key) }
  })
  offers.set(key, offer)
  return offer
}

watch(token, () => {
  for (const offer of offers.values()) offer.close()
  offers.clear()
}, { flush: 'sync' })
