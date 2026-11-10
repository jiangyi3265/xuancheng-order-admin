// 催客户验收 / 催款：把要说的话整理好，省得每次自己打。
// 客户不一定开着系统，所以两件事一起做：系统里留一条，同样的话复制好，方便再粘到微信发一遍。
import { h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addProgress } from '@/mock/store'
import { loginLink } from '@/utils/loginInfo'
import { owed, money } from '@/utils/payment'
import { todayStr } from '@/utils/date'

// 复制一段话；复制不了（微信内置浏览器、没给权限）就弹出来让人手动选中复制
export async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text)
    if (okMessage) ElMessage.success(okMessage)
    return true
  } catch {
    ElMessageBox.alert(
      h('pre', { style: 'margin:0;white-space:pre-wrap;font:inherit;line-height:1.7;user-select:text;-webkit-user-select:text' }, text),
      '没法自动复制，请长按或选中下面这段话手动复制',
      { confirmButtonText: '好的' }
    ).catch(() => {})
    return false
  }
}

// ---- 催客户验收 ----
// 这半句既是发出去的内容，也用来认「今天是不是已经催过了」，改措辞时只改这里
const ACCEPT_MARK = '已经做完交付了，麻烦抽空验收一下'
export const acceptNudgeText = (o) =>
  `「${o.title}」${ACCEPT_MARK}：没问题点「确认验收」就行，有要改的直接在「修改需求」里提。`
export const isAcceptNudge = (content) => String(content || '').includes(ACCEPT_MARK)

// 待验收、已绑定客户账号：客户自己可以点「确认验收」，这时才谈得上催
export const awaitingCustomer = (o) => o?.status === 'review' && !!o?.customerAccount

// 今天是不是已经催过：详情里看全部沟通记录，列表里只有最后一条消息可看
export function nudgedToday(o, chatItems) {
  const today = todayStr()
  const hit = (t) => t && t.type === 'reply' && isAcceptNudge(t.content) && String(t.time || '').slice(0, 10) === today
  return chatItems ? chatItems.some(hit) : hit(o?.lastMessage)
}

// 发到客户沟通，同时复制一份带登录地址的，粘到微信就能发。
// 先复制再发：有的浏览器只认「点击那一下」的复制，等请求回来就不让复制了
export async function nudgeCustomerAccept(o) {
  const text = acceptNudgeText(o)
  let copied = false
  try {
    await navigator.clipboard.writeText(text + '\n查看地址：' + loginLink())
    copied = true
  } catch {
    // 复制不了不影响发消息
  }
  await addProgress(o.id, text, 'reply', [])
  ElMessage.success(copied ? '已提醒客户验收；这句话也复制好了，可以粘到微信再发一遍' : '已提醒客户验收')
}
// 今天已经催过：只复制，不再往客户沟通里发第二遍
export const copyAcceptNudge = (o) =>
  copyText(acceptNudgeText(o) + '\n查看地址：' + loginLink(), '已复制，粘到微信发给客户就行')

// ---- 催款 ----
export function dunningText(o) {
  const hello = o.customer ? o.customer + '，您好！' : '您好！'
  const paid = Number(o.receivedAmount) > 0
    ? `总价 ${money(o.amount)}，已收 ${money(o.receivedAmount)}，还差 ${money(owed(o))}。`
    : `总价 ${money(o.amount)}，目前还没付款。`
  return `${hello}「${o.title}」的款项跟您对一下：\n${paid}\n方便的时候安排一下，谢谢！`
}
export const copyDunning = (o) => copyText(dunningText(o), '催款的话已复制，粘到微信发给客户就行')
