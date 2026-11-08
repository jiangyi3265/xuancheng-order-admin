const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

test('系统通知可连续展示两条 Bug，旧账号推送不会展示', async ({playwright,baseURL},testInfo) => {
  const origin=new URL(baseURL).origin
  const profile=testInfo.outputPath('notify-profile')
  const fs=require('node:fs')
  fs.mkdirSync(profile+'/Default',{recursive:true})
  fs.writeFileSync(profile+'/Default/Preferences',JSON.stringify({profile:{content_settings:{exceptions:{notifications:{[origin+',*']:{setting:1}}}}}}))
  const context=await playwright.chromium.launchPersistentContext(profile,{channel:'chromium',baseURL})
  try {
  const page=await context.newPage()
  // Use a dedicated Chromium profile with the notification permission granted above.
  await fixture(page)
  await page.goto('/#/login')
  const binding = 'fixture-recipient'
  await page.evaluate(async binding => {
    await navigator.serviceWorker.register('/system-notifications.js')
    await navigator.serviceWorker.ready
    await (await caches.open('xc-notification-state')).put('/.notification-binding',new Response(binding))
  },binding)
  const worker=context.serviceWorkers()[0]
  await worker.evaluate(()=>{
    self.seen=[]
    self.addEventListener('push',e=>self.seen.push(e.data.text()))
    const native=self.registration.showNotification.bind(self.registration)
    self.registration.showNotification=async (...args)=>{
      try {await native(...args);self.seen.push('presented:'+args[1].body+':'+args[1].data.path)}
      catch(e){self.seen.push('error:'+e.message);throw e}
    }
  })
  const cdp=await context.newCDPSession(page)
  let registrationId
  cdp.on('ServiceWorker.workerRegistrationUpdated',e=>{
    registrationId=e.registrations.find(r=>r.scopeURL===origin+'/')?.registrationId || registrationId
  })
  await cdp.send('ServiceWorker.enable')
  await expect.poll(()=>registrationId).toBeTruthy()
  const push=async (who,body,path)=>cdp.send('ServiceWorker.deliverPushMessage',{registrationId,origin:new URL(page.url()).origin,
    data:JSON.stringify({binding:who,title:'接单提醒',body,path})})
  await push(binding,'第一条','/#/order?id=1&tab=bugs&bug=4')
  await push('另一个账号','不应显示','/#/order?id=1')
  await push(binding,'第二条','/#/quotes?id=9&tab=chat')
  await push(binding,'无效链接','https://example.org/')
  await expect.poll(()=>worker.evaluate(()=>self.seen)).toEqual(expect.arrayContaining([
    'presented:第一条:/#/order?id=1&tab=bugs&bug=4','presented:第二条:/#/quotes?id=9&tab=chat','presented:无效链接:/#/messages'
  ]))
  expect(await worker.evaluate(()=>self.seen)).not.toContain('presented:不应显示:/#/order?id=1')
  } finally {await context.close()}
})

test('项目封面点开放大，再点收起并保留当前项目列表',async ({page})=>{
  await fixture(page)
  await page.addInitScript(()=>{localStorage.setItem('token','fixture-boss');localStorage.setItem('xc.orderView','list')})
  const coverUrl='/jiedan/media/'+'a'.repeat(32)+'.png'
  await page.route('**'+coverUrl,route=>route.fulfill({path:require('node:path').resolve(__dirname,'../public/app-icon-192.png')}))
  await page.route('**/jiedan/order/list',route=>route.fulfill({json:{code:200,data:[
    {...order,coverUrl}, {...order,id:2,title:'无附件',coverUrl:null}
  ]}}))
  await page.goto('/#/order')
  await expect(page.locator('.board-project-row').filter({hasText:'无附件'}).locator('.project-cover')).toHaveCount(0)
  await page.locator('.board-project-row .project-cover').first().click()
  await expect(page.locator('.fullscreen-image img')).toHaveAttribute('src',coverUrl)
  const dialog=page.locator('.fullscreen-image')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('width','390px')
  await dialog.locator('.image-stage').click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
})
