const switchKey = 'xc.notify'
const bindingKey = 'xc.notify.binding'
const endpoint = '/jiedan/webpush'

export function isNotifySupported() {
  return window.isSecureContext && 'Notification' in window
}
export function notifyState() {
  if (!isNotifySupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && localStorage.getItem(switchKey) === '1' ? 'on' : 'off'
}
const failedBindingKey='xc.notify.failedBinding'
export function hasBackgroundPush() {
  const binding=localStorage.getItem(bindingKey)
  return !!binding && localStorage.getItem(failedBindingKey)!==binding
}

async function api(path, method, body, token = localStorage.getItem('token')) {
  const response = await fetch(endpoint + path, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body), cache: 'no-store'
  })
  const result = await response.json()
  if (result.code !== 200) throw new Error(result.msg || '推送请求失败')
  return result.data
}

let workerReady
function registerWorker() {
  if (!workerReady) {
    workerReady = navigator.serviceWorker.register('/system-notifications.js')
      .then(() => navigator.serviceWorker.ready)
      .catch(error => { workerReady = undefined; throw error })
  }
  return workerReady
}

export async function enableNotify() {
  if (!isNotifySupported()) return 'unsupported'
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') return notifyState()
  localStorage.setItem(switchKey, '1')
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) return 'on'
  const token = localStorage.getItem('token')
  try {
    const reg = await registerWorker()
    const {key} = await api('/key','GET',undefined,token)
    const publicKey = Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0))
    const existing = await reg.pushManager.getSubscription()
    let timer
    let sub
    try {
      sub = existing || await Promise.race([
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('推送服务连接超时')),12000)})
      ])
    } finally { clearTimeout(timer) }
    const binding = crypto.randomUUID()
    const cache = await caches.open('xc-notification-state')
    await api('/device','POST',{endpoint:sub.endpoint,...sub.toJSON().keys,binding},token)
    if (localStorage.getItem('token') !== token || localStorage.getItem(switchKey) !== '1') {
      await api('/device/'+binding,'DELETE',undefined,token)
      return 'off'
    }
    await cache.put('/.notification-binding',new Response(binding))
    localStorage.setItem(bindingKey,binding)
  } catch { /* Local delivery is still available when the browser's push provider cannot connect. */ }
  return notifyState()
}

export function disableNotify() {
  const binding = localStorage.getItem(bindingKey)
  localStorage.removeItem(bindingKey)
  localStorage.removeItem(switchKey)
  if (binding) {
    api('/device/'+binding,'DELETE').catch(()=>{})
    caches.open('xc-notification-state').then(async cache => {
      const response = await cache.match('/.notification-binding')
      if (response && await response.text() === binding) await cache.delete('/.notification-binding')
    }).catch(()=>{})
  }
}

export async function showNotify(title, body, tag, path='/#/messages') {
  if (notifyState() !== 'on') return
  if ('serviceWorker' in navigator) {
    const reg = await registerWorker()
    await reg.showNotification(title,{ body, tag, data:{path} })
  } else {
    const notification = new Notification(title,{body,tag})
    notification.onclick = () => { window.focus(); window.location.hash = path.slice(1); notification.close() }
  }
}
export async function testSystemNotification() {
  const binding = localStorage.getItem(bindingKey)
  if(binding) {
    try {
      await api('/test/'+binding,'POST')
      localStorage.removeItem(failedBindingKey)
      return 'background'
    } catch(e) {
      localStorage.setItem(failedBindingKey,binding)
      await showNotify('玄成接单 · 页面通知测试','本机可以接收网页打开期间的通知。','xc-test')
      throw e
    }
  }
  await showNotify('玄成接单 · 测试通知','这台设备已收到系统提醒。','xc-test')
}
