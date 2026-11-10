const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const picture = (n) => ({type:'image', name:'需求图'+n+'.png', url:'/app-icon-192.png?img='+n})
const issues = [
  {id:31,time:'2026-11-08 12:30',status:'open',attachments:[picture(1),{type:'file',url:'/readme.pdf',name:'说明.pdf'},picture(2)]},
  {id:32,time:'2026-11-08 10:00',status:'open',updates:[{id:5,attachments:[picture(3)]}]}
]
const project = {...order,bugs:issues,actionBugCount:0,unread:[]}
async function openList(page) {
  await fixture(page,'employee')
  await page.addInitScript(()=>localStorage.setItem('token','fixture-employee'))
  for (const [endpoint,data] of [['list',[project]],['1',project],['1/version',{version:project.version}],['read',{id:1,version:project.version}]]) {
    await page.route('**/jiedan/order/'+endpoint,r=>r.fulfill({json:{code:200,data}}))
  }
  await page.goto('/#/order?id=1&tab=bugs')
}

test('折叠清单从选中的图开始，跨问题与补充切换，页码、缩放与边界正确', async ({page})=>{
  await openList(page)
  const thumb = page.getByRole('button',{name:'放大需求图2.png'}).first()
  await thumb.click()
  const dialog = page.locator('dialog.fullscreen-image')
  const count = dialog.locator('.gallery-count')
  await expect(count).toHaveText('2 / 3')
  const zoom = dialog.locator('.scale')
  await expect(zoom).toHaveText('100%')
  await dialog.getByRole('button',{name:'缩小图片'}).click()
  await expect(zoom).toHaveText('67%')
  await dialog.getByRole('button',{name:'下一张图片'}).click()
  await expect(dialog).toHaveAccessibleName('需求图3.png')
  await expect(dialog).toContainText('问题 #32 · 补充说明')
  await expect(zoom).toHaveText('100%')
  await expect(dialog.getByRole('button',{name:'下一张图片'})).toBeDisabled()
  await page.keyboard.press('ArrowLeft')
  await expect(count).toHaveText('2 / 3')
  await dialog.getByRole('button',{name:'上一张图片'}).click()
  await expect(dialog.getByRole('button',{name:'上一张图片'})).toBeDisabled()
  await expect(dialog).toHaveAccessibleName('需求图1.png')
  await page.keyboard.press('Escape')
  await expect(thumb).toBeFocused()
})

test.describe('触屏',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:740}})
  test('整图时手势切换，放大时手势保留给查看细节',async({page})=>{
    await openList(page)
    await page.getByRole('button',{name:'放大需求图1.png'}).first().click()
    const dialog=page.locator('dialog.fullscreen-image')
    await expect(dialog.locator('.scale')).toHaveText('100%')
    const cdp=await page.context().newCDPSession(page)
    async function swipe() {
      const {x,y,width,height}=await dialog.locator('.image-stage').boundingBox()
      const start=Math.round(x+width*.8), top=Math.round(y+height*.55)
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y:top}]})
      for(const delta of [20,55,100,145]) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start-delta,y:top}]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
    }
    try {
      await swipe()
      await expect(dialog.locator('.gallery-count')).toHaveText('2 / 3')
      await dialog.getByRole('button',{name:'放大图片'}).click()
      await expect(dialog.locator('.scale')).toHaveText('150%')
      await swipe()
      await expect(dialog.locator('.gallery-count')).toHaveText('2 / 3')
      await expect(dialog).toBeVisible()
    } finally { await cdp.detach() }
  })
})
