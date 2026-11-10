const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

// The server returns Shanghai wall time, even if the viewer is abroad.
test.use({timezoneId:'America/Los_Angeles'})
const now = '2026-11-08T12:00:00+08:00'
async function openProject(page, width) {
  await page.clock.setFixedTime(new Date(now))
  await page.setViewportSize({width,height:800})
  await fixture(page,'employee')
  await page.addInitScript(()=>localStorage.setItem('token','fixture-employee'))
  const bugs = [
    [40,'外观问题','action','2026-11-05 12:00'],
    [9,'刚提交的文字','open','2026-11-08 11:30'],
    [15,'已确认的页面','resolved','2026-11-07 12:00'],
    [2,'昨天的图标','action','2026-11-07 11:59'],
    [19,'以前的需求','resolved','2026-11-05 11:59'],
    [55,'旧资料导入','open',null],
    [12,'同一分钟的图片','resolved','2026-11-08 11:30']
  ].map(([id,content,status,time])=>({id,content,status,time,attachments:[],updates:[]}))
  const project = {...order,bugs,actionBugCount:2,unread:[]}
  const ok = (r,data)=>r.fulfill({json:{code:200,data}})
  for (const [url,data] of [['list',[project]],['1',project],['read',{id:1}],['1/version',{version:project.version}]]) {
    await page.route('**/jiedan/order/'+url,r=>ok(r,data))
  }
  await page.goto('/#/order?id=1&tab=bugs')
  const panel = page.locator('.bug-panel')
  const rows = panel.locator('.bug-item')
  const time = panel.getByRole('group',{name:'按提交时间筛选'})
  const state = panel.getByRole('group',{name:'按解决状态筛选'})
  const ids = () => rows.evaluateAll(items=>items.map(el=>Number(el.dataset.noticeId)))
  return {panel,rows,project,ids,time,state,ok}
}
for (const width of [390,1440]) {
  test('新问题优先，时间和状态可组合，过滤后能定位历史通知 · '+width, async ({page})=>{
    const {panel,ids,time,state} = await openProject(page,width)
    await expect(time.getByRole('button',{name:'全部时间'})).toHaveAttribute('aria-pressed','true')
    await expect(state.getByRole('button',{name:'全部状态'})).toHaveAttribute('aria-pressed','true')
    await expect.poll(ids).toEqual([12,9,15,2,40,19,55])
    await time.getByRole('button',{name:'近 1 天'}).click()
    await expect.poll(ids).toEqual([12,9,15])
    await state.getByRole('button',{name:'未解决',exact:true}).click()
    await expect.poll(ids).toEqual([9])
    await time.getByRole('button',{name:'近 3 天'}).click()
    await expect.poll(ids).toEqual([9,2,40])
    await panel.getByRole('button',{name:'逐条处理（2）'}).click()
    await expect.poll(ids).toEqual([2])
    await panel.getByRole('button',{name:'下一条',exact:true}).click()
    await expect.poll(ids).toEqual([40])
    await panel.getByRole('button',{name:'返回全部问题'}).click()
    await expect.poll(ids).toEqual([9,2,40])
    await state.getByRole('button',{name:'已解决',exact:true}).click()
    await expect.poll(ids).toEqual([12,15])
    await page.evaluate(()=>{location.hash='/order?id=1&tab=bugs&bug=19'})
    await expect(panel.locator('.notice-target')).toContainText('以前的需求')
    await expect(panel.locator('.notice-target .bug-disclosure')).toHaveAttribute('aria-expanded','true')
    await expect(time.getByRole('button',{name:'全部时间'})).toHaveAttribute('aria-pressed','true')
  })
}
test('清空结果可恢复，筛选时记下问题可在第一条看到', async ({page})=>{
  const {panel,project,ids,time,state,ok} = await openProject(page,390)
  await page.clock.setFixedTime(new Date('2026-11-12T12:00:00+08:00'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await time.getByRole('button',{name:'近 1 天'}).click()
  await expect(panel.getByText('没有符合筛选条件的问题')).toBeVisible()
  await panel.getByRole('button',{name:'清除筛选'}).click()
  await expect.poll(ids).toHaveLength(7)
  await time.getByRole('button',{name:'近 1 天'}).click()
  await state.getByRole('button',{name:'已解决',exact:true}).click()
  await page.route('**/jiedan/order/bug', r=>{
    project.bugs.push({id:56,status:'open',content:r.request().postDataJSON().content,time:'2026-11-12 12:00'})
    project.version++
    return ok(r,project)
  })
  await panel.getByRole('button',{name:'记一条问题',exact:true}).click()
  await panel.getByPlaceholder('写清楚是什么问题，可以直接粘贴截图').fill('新增需求')
  await panel.getByRole('button',{name:'记下问题',exact:true}).click()
  await expect.poll(ids).toEqual([56])
  await expect(panel.locator('.bug-item').first()).toContainText('新增需求')
  await expect(time.getByRole('button',{name:'近 1 天'})).toHaveAttribute('aria-pressed','true')
})
