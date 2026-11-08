const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const filename = '问题圈注长图.svg'
const attachment = {name:filename, type:'image', url:'/test-media/annotated-long.svg'}
// The center of the red circle is at (90%, 96%) of the original image.
const longImage = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="4000"><rect width="800" height="4000" fill="white"/><circle cx="720" cy="3840" r="40" fill="none" stroke="red" stroke-width="7"/></svg>'

async function visitIssue(page, serveImage) {
  await fixture(page,'employee')
  await page.addInitScript(()=>localStorage.setItem('token','fixture-employee'))
  const bug = {...order.bugs[0],id:7,status:'action',attachments:[attachment]}
  const project = {...order,bugs:[bug],actionBugCount:1,unread:[]}
  const ok = (route,data)=>route.fulfill({json:{code:200,data}})
  await page.route('**/test-media/annotated-long.svg',serveImage)
  await page.route('**/jiedan/order/list',r=>ok(r,[project]))
  await page.route('**/jiedan/order/1',r=>ok(r,project))
  await page.route('**/jiedan/order/1/version',r=>ok(r,{version:project.version}))
  await page.route('**/jiedan/order/read',r=>ok(r,{id:1,version:project.version}))
  await page.goto('/#/order?id=1&tab=bugs&bug=7')
  return page.locator('.bug-panel .notice-target').getByRole('button',{name:'放大'+filename})
}

const serveLongImage = route => route.fulfill({contentType:'image/svg+xml',body:longImage})

async function openIssueImage(page) {
  const thumb = await visitIssue(page, serveLongImage)
  await thumb.click()
  const dialog = page.getByRole('dialog',{name:filename})
  await expect(dialog).toBeVisible()
  const image = dialog.getByRole('img',{name:filename})
  await expect(image).toHaveJSProperty('naturalHeight',4000)
  return {thumb,dialog,image,stage:dialog.locator('.image-stage')}
}

test('首次加载附件时可点开，慢网有反馈，失败后能在原位重试', async ({page}) => {
  let failRequest
  const firstAttempt = new Promise(resolve => { failRequest = resolve })
  let retry = false
  const thumb = await visitIssue(page, async route => {
    if (retry) return serveLongImage(route)
    await firstAttempt
    await route.fulfill({status:503,body:'unavailable'})
  })
  await expect(thumb).toHaveText('加载中')
  await thumb.click()
  const dialog = page.getByRole('dialog',{name:filename})
  await expect(dialog.getByRole('status')).toHaveText('正在加载图片…')
  // Even before load settles, the image must be paintable as its bytes arrive.
  await expect(dialog.locator('img')).toHaveCSS('visibility','visible')
  failRequest()
  await expect(dialog.getByRole('status')).toHaveText('图片加载失败')
  retry = true
  await dialog.getByRole('button',{name:'重新加载'}).click()
  await expect(dialog.getByRole('img',{name:filename})).toHaveJSProperty('naturalHeight',4000)
  await expect(dialog.getByRole('status')).toHaveCount(0)
  await expect(dialog.getByRole('button',{name:'放大图片'})).toBeEnabled()
})

async function swipeUp(page,stage) {
  const box = await stage.boundingBox()
  const x = Math.round(box.x + box.width/2)
  const start = Math.round(box.y + box.height*0.8)
  const client = await page.context().newCDPSession(page)
  try {
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]})
    for (const dy of [25,70,130,210]) {
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start-dy}]})
    }
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  } finally {
    await client.detach()
  }
}

for (const {device,viewport,touch} of [
  {device:'手机',viewport:{width:390,height:720},touch:true},
  {device:'电脑',viewport:{width:1366,height:768},touch:false}
]) {
  test.describe(device,()=>{
    test.use({viewport,hasTouch:touch})
    test('问题长图能看全、放大滚到右下圈注并点击返回', async ({page,browserName})=>{
      const {thumb,dialog,image,stage} = await openIssueImage(page)
      await expect.poll(()=>stage.evaluate(el=>el.scrollHeight/el.clientHeight)).toBeGreaterThan(2)
      expect(await stage.evaluate(el=>el.scrollTop)).toBe(0)
      if (touch && browserName==='chromium') await swipeUp(page,stage)
      else {
        await stage.hover()
        await page.mouse.wheel(0,420)
      }
      await expect.poll(()=>stage.evaluate(el=>el.scrollTop)).toBeGreaterThan(20)
      await expect(dialog).toBeVisible()

      await dialog.getByRole('button',{name:'查看整图'}).click()
      await expect.poll(()=>stage.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1)
      const whole = await image.boundingBox()
      expect(whole.height/whole.width).toBeCloseTo(5,1)
      expect(whole.y).toBeGreaterThanOrEqual(0)
      expect(whole.y + whole.height).toBeLessThanOrEqual(viewport.height+1)

      await dialog.getByRole('button',{name:'适应宽度'}).click()
      const initialWidth = (await image.boundingBox()).width
      await dialog.getByRole('button',{name:'放大图片'}).click()
      await expect.poll(async ()=>(await image.boundingBox()).width).toBeGreaterThan(initialWidth)
      if (!touch) {
        const oldLeft = await stage.evaluate(el=>el.scrollLeft)
        const frame = await stage.boundingBox()
        const x = frame.x + frame.width/2, y = frame.y + frame.height/2
        await page.mouse.move(x,y)
        await page.mouse.down()
        await page.mouse.move(x-96,y-90,{steps:7})
        await page.mouse.up()
        await expect(dialog).toBeVisible()
        await expect.poll(()=>stage.evaluate(el=>el.scrollLeft)).toBeGreaterThan(oldLeft + 35)
      }
      await stage.evaluate(el=>el.scrollTo(el.scrollWidth,el.scrollHeight))
      const circle = await image.evaluate(el=>{
        const rect=el.getBoundingClientRect()
        const x=rect.left+rect.width*0.9, y=rect.top+rect.height*0.96
        return {x,y,visible:document.elementFromPoint(x,y)===el}
      })
      expect(circle.visible).toBe(true)
      if (touch) await page.touchscreen.tap(circle.x,circle.y)
      else await page.mouse.click(circle.x,circle.y)
      await expect(dialog).not.toBeVisible()
      await expect(thumb).toBeInViewport()
    })
  })
}
