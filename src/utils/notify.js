// 浏览器桌面提醒：纯前端，不依赖微信推送。
// 网页开着（可以最小化、切到别的标签）时，有新待办就弹一条系统通知。
// 手机浏览器大多没有这个能力，此时 isNotifySupported() 为 false，界面上整个功能都不显示。

const SWITCH_KEY = 'xc.notify'

// 安卓/苹果手机浏览器：有的（如安卓 Chrome）声明了 Notification，但一创建就报错，当作不支持
const PHONE_UA = /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i

export function isNotifySupported() {
  if (typeof Notification === 'undefined') return false
  try {
    return !PHONE_UA.test(navigator.userAgent || '')
  } catch (e) {
    return true
  }
}

function readSwitch() {
  try {
    return localStorage.getItem(SWITCH_KEY) === '1'
  } catch (e) {
    return false
  }
}

function writeSwitch(on) {
  try {
    if (on) localStorage.setItem(SWITCH_KEY, '1')
    else localStorage.removeItem(SWITCH_KEY)
  } catch (e) {
    // 存不了（隐私模式等）就算了，这次只在当前页面有效
  }
}

function readPermission() {
  try {
    return Notification.permission
  } catch (e) {
    return 'default'
  }
}

// 'unsupported' 不支持 | 'denied' 浏览器里被禁止 | 'off' 没开 | 'on' 已开（已授权，且用户开关也是开的）
export function notifyState() {
  if (!isNotifySupported()) return 'unsupported'
  const permission = readPermission()
  if (permission === 'denied') return 'denied'
  if (permission === 'granted' && readSwitch()) return 'on'
  return 'off'
}

// 向浏览器要权限（老 Safari 只认回调写法，新浏览器返回 Promise，两种都兼容）
function askPermission() {
  return new Promise((resolve) => {
    try {
      const ret = Notification.requestPermission((p) => resolve(p))
      if (ret && typeof ret.then === 'function') ret.then(resolve, () => resolve('default'))
    } catch (e) {
      resolve('default')
    }
  })
}

// 必须在点击事件里调用（浏览器只在用户点击时才肯弹出授权询问）。返回开启后的状态。
export async function enableNotify() {
  if (!isNotifySupported()) return 'unsupported'
  try {
    let permission = readPermission()
    if (permission === 'default') permission = await askPermission()
    if (permission === 'granted') writeSwitch(true)
  } catch (e) {
    // 忽略，下面按当前状态返回
  }
  return notifyState()
}

// 只是关掉我们自己的开关；浏览器里的授权没法由网页撤销，下次再开不会重新询问
export function disableNotify() {
  writeSwitch(false)
}

// 弹一条通知。没开启时什么也不做。同一个 tag 的通知会互相替换，不会越堆越多。
export function showNotify(title, body, tag) {
  if (notifyState() !== 'on') return
  try {
    const options = { body }
    if (tag) {
      options.tag = tag
      options.renotify = true // 替换旧通知时仍然提醒一下
    }
    const n = new Notification(title, options)
    n.onclick = () => {
      try {
        window.focus()
      } catch (e) {
        // ignore
      }
      try {
        n.close()
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // 创建失败（浏览器不允许等）直接忽略，不影响页面
  }
}
