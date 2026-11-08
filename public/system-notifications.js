function safeNotificationPath(path) {
  return typeof path === 'string' && /^\/#\/(?:workbench|messages|quotes\?id=\d+(?:&tab=chat)?|approvals\?id=\d+|order\?id=\d+(?:&tab=(?:bugs(?:&bug=\d+)?|(?:chat|internal)(?:&entry=\d+)?))?)$/.test(path)
    ? path : '/#/messages'
}

// The binding prevents a queued push for a former account from displaying on a shared device.
async function activeBinding() {
  const cache = await caches.open('xc-notification-state')
  return (await (await cache.match('/.notification-binding'))?.text()) || ''
}

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    const message = event.data?.json()
    if (!message?.binding || message.binding !== await activeBinding()) return
    const path = safeNotificationPath(message.path)
    await self.registration.showNotification('玄成接单 · ' + message.title, {
      body: message.body, icon: '/app-icon-192.png', data: { path, binding: message.binding }
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const data = event.notification.data || {}
    if (data.binding && data.binding !== await activeBinding()) return
    const url = new URL(safeNotificationPath(data.path), self.location.origin)
    if (url.origin !== self.location.origin) return
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const app = windows.find(w => new URL(w.url).origin === self.location.origin)
    if (app) {
      await app.focus()
      app.postMessage({ type: 'open-notification', path: url.hash.slice(1) })
    } else await clients.openWindow(url.href)
  })())
})
