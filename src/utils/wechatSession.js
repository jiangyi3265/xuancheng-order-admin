export const inWeChat = /MicroMessenger|wxwork/i.test(navigator.userAgent)

async function deviceRequest(action, bearer) {
  const headers = {'X-XC-Device':'1'}
  if (bearer) headers.Authorization = 'Bearer ' + bearer
  const response = await fetch('/jiedan/session/' + action, {
    method:'POST', credentials:'same-origin', cache:'no-store', headers
  })
  const json = await response.json()
  if (json.code !== 200) throw new Error(json.msg || '微信登录状态保存失败')
  return json.data
}
export async function rememberWechatSession(bearer) { await deviceRequest('remember',bearer) }
export async function restoreWechatSession() { return (await deviceRequest('restore'))?.token || '' }
export async function forgetWechatSession(bearer) { await deviceRequest('forget',bearer) }
