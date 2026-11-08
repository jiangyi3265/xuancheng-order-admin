// 建好账号 / 重置密码后，顺手把「地址 + 账号 + 密码」整理成一段话，一键复制发到微信，不用再自己拼。
// 用右上角的通知卡片（不挡操作），点「复制这段话」才复制，关掉就算了。
import { h } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'

export function loginLink() {
  return window.location.origin + '/#/login'
}

// who: 'customer' 客户 / 'staff' 同事；hint：只显示在卡片里、不复制的提醒
export function offerLoginInfo({ name = '', userName, password, who = 'customer', reset = false, hint = '' }) {
  const lines = [
    who === 'customer'
      ? `${name ? name + '，您好' : '您好'}！项目进度和沟通可以在这里查看：`
      : `${name ? name + '，' : ''}接单系统的登录信息：`,
    `地址：${loginLink()}`,
    `账号：${userName}`,
    `${reset ? '新密码' : '密码'}：${password}`
  ]
  if (who === 'staff') lines.push('登录后可以在「我的 → 账号与安全」里改密码。')
  const text = lines.join('\n')
  let notice = null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success('已复制，粘贴到微信发过去就行')
      notice?.close()
    } catch {
      ElMessage.warning('复制失败，请手动记下账号和密码')
    }
  }
  notice = ElNotification({
    title: (reset ? '密码已重置' : '账号已建好') + (who === 'customer' ? '，发给客户' : '，发给同事'),
    type: 'success',
    duration: 0,
    customClass: 'login-info-notice',
    message: h('div', [
      h('pre', { style: 'margin:0 0 8px;white-space:pre-wrap;font:inherit;font-size:13px;line-height:1.7;color:#303133' }, text),
      hint ? h('p', { style: 'margin:0 0 8px;color:#909399;font-size:12px;line-height:1.5' }, hint) : null,
      h('button', {
        type: 'button',
        style: 'border:0;border-radius:6px;padding:6px 14px;background:#409eff;color:#fff;font-size:13px;cursor:pointer',
        onClick: copy
      }, '复制这段话')
    ])
  })
  return notice
}
