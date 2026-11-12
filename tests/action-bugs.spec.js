const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

test('工作台仅将明确交办的问题列为待办，点处理问题打开对应清单', async ({ page }) => {
  await fixture(page, 'employee')
  const project = { ...order, ownerId: 2, unread: [2], actionBugCount: 0 }
  await page.route('**/jiedan/order/list', route => route.fulfill({ json: { code: 200, data: [project] } }))
  await page.route('**/jiedan/order/1', route => route.fulfill({ json: { code: 200, data: project } }))
  await page.route('**/jiedan/order/read', route => route.fulfill({ json: { code: 200, data: { id: 1, version: 1 } } }))
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))
  await page.goto('/#/workbench')
  await expect(page.getByText('当前没有轮到你的事项')).toBeVisible()
  project.actionBugCount = 1
  project.bugs = [{ ...order.bugs[0], status: 'action' }]
  await page.reload()
  await expect(page.locator('.handoff-card')).toContainText('1 个问题需处理')
  await page.locator('.handoff-card').getByRole('link', { name:'看一下', exact:true }).click()
  await expect(page.locator('.bug-panel')).toBeVisible()
  await expect(page.locator('.bug-panel .is-active')).toContainText('需处理')
})

for (const width of [390, 1366]) {
  test('微信通知登录后定位到指定 Bug，并能连续打开另一条 · ' + width, async ({page}) => {
    await page.setViewportSize({width, height: 844})
    await fixture(page, 'employee')
    const bugs = Array.from({length: 10}, (_, i) => ({...order.bugs[0], id:i+1, content:'问题记录 '+(i+1)}))
    const data = {...order, bugs, unread:[]}
    const {bugs: ignored, timeline, ...summary} = data
    await page.route('**/jiedan/order/list', route => route.fulfill({json:{code:200, data:[summary]}}))
    await page.route('**/jiedan/order/1', route => route.fulfill({json:{code:200, data}}))
    await page.route('**/jiedan/order/read', route => route.fulfill({json:{code:200, data:{id:1,version:1}}}))
    await page.goto('/#/order?id=1&tab=bugs&bug=9')
    await expect(page).toHaveURL(/#\/login\?redirect=/)
    await page.getByPlaceholder('请输入登录账号').fill('staff')
    await page.getByPlaceholder('请输入密码',{exact:true}).fill('test-password')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    const selected = page.locator('.bug-panel .notice-target')
    await expect(selected).toHaveText(/问题记录 9/)
    await expect(selected).toBeInViewport()
    await page.evaluate(() => {location.hash='/order?id=1&tab=bugs&bug=3'})
    await expect(selected).toHaveText(/问题记录 3/)
    await expect(selected).toBeInViewport()
    await page.evaluate(() => {location.hash='/order?id=1&tab=internal&entry=2'})
    await expect(page.locator('.record-panel .notice-target')).toContainText('内部保密内容')
    await expect(page.locator('.record-panel .notice-target')).toBeInViewport()
    await page.evaluate(() => {location.hash='/order?id=1&tab=bugs&bug=999'})
    await expect(page.getByRole('status').filter({hasText:'问题已删除'})).toBeVisible()
  })
}

test('微信内有过期会话时，登录后回到同一份报价', async ({page}) => {
  await fixture(page, 'employee')
  await page.addInitScript(() => localStorage.setItem('token','expired'))
  await page.route('**/jiedan/staff/me', async route => {
    if (route.request().headers().authorization === 'Bearer expired') {
      await route.fulfill({json:{code:401, msg:'登录已过期'}})
    } else await route.fallback()
  })
  await page.route('**/jiedan/quote/83', route => route.fulfill({json:{
    code:200, data:{id:83, title:'移动端报价', employeeId:2, status:'pending', attachments:[]}
  }}))
  await page.goto('/#/quotes?id=83')
  await expect(page).toHaveURL(/#\/login\?redirect=/)
  await page.getByPlaceholder('请输入登录账号').fill('staff')
  await page.getByPlaceholder('请输入密码',{exact:true}).fill('test-password')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'报价详情'})).toContainText('移动端报价')
})

test('电脑工作台的处理问题直达唯一待处理 Bug，再普通打开可回到项目总览', async ({page}) => {
  await page.setViewportSize({width:1366,height:720})
  await fixture(page,'employee')
  const bugs = [
    {...order.bugs[0],id:1,status:'open',content:'仅记录'},
    {...order.bugs[0],id:7,status:'action',content:'修复页脚错位'}
  ]
  const project = {...order,ownerId:2,actionBugCount:1,bugs}
  const {bugs: ignoredBugs, timeline: ignoredTimeline, ...summary} = project
  await page.route('**/jiedan/order/list', r => r.fulfill({json:{code:200,data:[summary]}}))
  await page.route('**/jiedan/order/1', r => r.fulfill({json:{code:200,data:project}}))
  await page.route('**/jiedan/order/read', r => r.fulfill({json:{code:200,data:{id:1,version:1}}}))
  await page.addInitScript(() => localStorage.setItem('token','fixture-employee'))
  await page.goto('/#/workbench')
  const card = page.locator('.handoff-card[data-kind="bug"]').filter({hasText:project.title})
  await card.getByRole('link',{name:'看一下',exact:true}).click()
  const tab = page.getByRole('navigation',{name:'项目详情视图'})
  await expect(tab.getByRole('button',{name:'问题',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.bug-panel .notice-target')).toContainText('修复页脚错位')
  await page.locator('.workspace-head .close-btn').click()
  await page.goto('/#/order?id=1')
  await expect(tab.getByRole('button',{name:'全部',exact:true})).toHaveAttribute('aria-pressed','true')
})

test('逐条解决后，晚返回的项目详情不会将已解决问题移回队列', async ({page}) => {
  await fixture(page,'employee')
  await page.addInitScript(() => localStorage.setItem('token','fixture-employee'))
  const bugs = [7,8].map(id => ({...order.bugs[0],id,status:'action',content:'处理问题 '+id}))
  const before = {...order,version:10,actionBugCount:2,bugs,unread:[]}
  const after = {...before,version:11,actionBugCount:1,bugs:[{...bugs[0],status:'resolved'},bugs[1]]}
  const ok = (r,data) => r.fulfill({json:{code:200,data}})
  let current=before, holdNext=false, held, writes=0
  await page.route('**/jiedan/order/list', r => {
    const {bugs,timeline,...summary} = current
    return ok(r,[summary])
  })
  await page.route('**/jiedan/order/1/version',r=>ok(r,{version:current.version}))
  await page.route('**/jiedan/order/1',r=>{
    if(holdNext){held=r; holdNext=false; return}
    if(held)return r.fulfill({json:{code:503,msg:'后续详情暂时离线'}})
    return ok(r,current)
  })
  await page.route('**/jiedan/order/read',r=>ok(r,{id:1,version:current.version}))
  await page.route('**/jiedan/order/bug/7/status',r=>{writes++;current=after;return ok(r,after)})
  await page.goto('/#/order?id=1&tab=bugs&bug=7')
  const panel=page.locator('.bug-panel')
  await panel.getByRole('button',{name:/^逐条处理（/}).click()
  await expect(panel.locator('.bug-item')).toContainText('处理问题 7')
  holdNext=true
  await page.evaluate(()=>dispatchEvent(new Event('focus')))
  await expect.poll(()=>Boolean(held)).toBe(true)
  await panel.getByRole('button',{name:'完成'}).click()
  await expect(panel.getByRole('status')).toContainText('剩余 1 条')
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/jiedan/order/1')
  await ok(held,before)
  await (await response).finished()
  // Wait until the next poll: if the old detail was reapplied, a later fresh GET
  // must not mask it. Further full GETs are deliberately unavailable.
  await page.waitForRequest(r => new URL(r.url()).pathname==='/jiedan/order/1/version')
  await expect(panel.getByRole('status')).toContainText('剩余 1 条')
  await expect(panel.locator('.bug-item')).toContainText('处理问题 8')
  expect(writes).toBe(1)
})
