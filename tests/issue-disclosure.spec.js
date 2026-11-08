const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

for (const width of [390, 1366]) {
  test('问题独立折叠，刷新列表后保留选择，打开问题通知展开目标 · ' + width, async ({page}) => {
    const errors = await fixture(page, 'employee')
    await page.setViewportSize({width,height:780})
    await page.addInitScript(() => localStorage.setItem('token','fixture-employee'))
    const issues = [
      {id:4,content:'调整标题字号',status:'action'},
      {id:8,content:'首页的标记位置',status:'open',attachments:[{url:'/app-icon-192.png',type:'image',name:'截图.png'}]},
      {id:16,content:'已经交付的问题',status:'resolved',updates:[{id:81,content:'上个版本已确认',attachments:[
        {url:'/说明.pdf',type:'file',name:'说明.pdf'},
        ...[1,2,3,4].map(n=>({url:'/app-icon-192.png?图='+n,type:'image',name:'补充截图'+n+'.png'}))
      ]}]}
    ]
    const project = {...order,bugs:issues,unread:[],actionBugCount:1}
    const ok = (route, data) => route.fulfill({json:{code:200,data}})
    const writes = []
    page.on('request',r=>{
      if (r.method() !== 'GET' && r.url().includes('/jiedan/order/bug/')) writes.push(r.url())
    })
    await page.route('**/jiedan/order/list',r=>ok(r,[project]))
    await page.route('**/jiedan/order/1',r=>ok(r,project))
    await page.route('**/jiedan/order/1/version',r=>ok(r,{version:project.version}))
    await page.route('**/jiedan/order/read',r=>ok(r,{id:1,version:project.version}))
    await page.goto('/#/order?id=1&tab=bugs')
    const issue = id => page.locator('.bug-panel [data-notice-id="'+id+'"]')
    const toggle = id => issue(id).locator('.bug-disclosure')
    await expect(toggle(4)).toHaveAttribute('aria-expanded','true')
    await expect(toggle(8)).toHaveAttribute('aria-expanded','false')
    await expect(issue(8)).toContainText('1 个附件')
    await expect(issue(16)).toContainText('1 条补充')
    for (const [id,name] of [[8,'截图.png'],[16,'补充截图1.png']]) {
      const thumb = issue(id).getByRole('button',{name:'放大'+name,exact:true})
      await expect(issue(id).locator('.bug-summary-previews img').first()).toHaveJSProperty('naturalWidth',192)
      await thumb.click()
      const preview = page.getByRole('dialog',{name,exact:true})
      await expect(preview.getByRole('img',{name,exact:true})).toBeVisible()
      await preview.getByRole('button',{name:'关闭图片预览'}).click()
      await expect(toggle(id)).toHaveAttribute('aria-expanded','false')
    }
    await issue(16).getByRole('button',{name:'展开查看其余 1 张图片'}).click()
    await expect(issue(16).getByRole('button',{name:'放大补充截图4.png'})).toBeVisible()
    await toggle(16).click()
    await page.getByRole('button',{name:'全部收起',exact:true}).click()
    await expect(page.locator('.bug-disclosure[aria-expanded="true"]')).toHaveCount(0)
    await page.getByRole('button',{name:'全部展开',exact:true}).click()
    await expect(page.locator('.bug-disclosure[aria-expanded="true"]')).toHaveCount(3)
    await toggle(16).click()
    await toggle(8).click()
    await toggle(8).focus()
    await toggle(8).press('Enter')
    await expect(issue(8).locator('.media-thumb')).toBeVisible()
    await issue(8).getByRole('button',{name:'补充说明',exact:true}).click()
    await issue(8).locator('textarea').fill('正在写的意见')
    await toggle(8).click()
    await expect(issue(8).getByRole('button',{name:'放大截图.png'})).toBeVisible()
    await expect(issue(8).locator('.bug-details')).toHaveCount(0)
    await toggle(4).click()
    project.bugs = [{...issues[0],content:'调整商品标题字号'},issues[2],issues[1]]
    project.version++
    await page.evaluate(() => dispatchEvent(new Event('focus')))
    await expect(toggle(4)).toContainText('调整商品标题字号')
    await expect(toggle(4)).toHaveAttribute('aria-expanded','false')
    await page.evaluate(() => {location.hash = '/order?id=1&tab=bugs&bug=8'})
    await expect(toggle(8)).toHaveAttribute('aria-expanded','true')
    await expect(issue(8).locator('.media-thumb')).toBeInViewport()
    await issue(8).getByRole('button',{name:'补充说明',exact:true}).click()
    await expect(issue(8).locator('textarea')).toHaveValue('正在写的意见')
    await expect(toggle(16)).toHaveAttribute('aria-expanded','false')
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
