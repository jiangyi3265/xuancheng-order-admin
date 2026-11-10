const {test, expect} = require('@playwright/test')
const {login, noOverflow, order} = require('./fixtures.cjs')

test.use({timezoneId:'America/Los_Angeles'})

function project(id, title, entries) {
  const requirements = entries.map(([id, title, status, submittedAt]) => ({id, title, status, submittedAt}))
  return {
    ...order, id, title, requirements,
    bugs: requirements.map(r => ({
      id:r.id, content:r.title, status:r.status==='resolved' ? 'resolved' : 'open',
      progressStatus:r.status, time:r.submittedAt, updates:[], attachments:[]
    }))
  }
}
const ok = (route, data) => route.fulfill({json:{code:200,data}})

async function visit(page, width) {
  await page.setViewportSize({width,height:780})
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00+08:00'))
  await login(page,'customer')
  const primary = project(1, '行程系统', [
    [50,'更换车站图片','action','2026-11-05 12:00'],
    [4,'调整按钮位置','open','2026-11-08 10:00'],
    [8,'补充路线信息','action','2026-11-07 12:00'],
    [20,'更新酒店名称','resolved','2026-11-08 10:00'],
    [55,'历史价格表','resolved','2026-11-05 11:59'],
    [24,'增加人数选项','open','2026-11-07 11:59'],
    [70,'导入记录','open',null]
  ])
  const other = project(2, '票务系统', [[99,'票务结算','resolved','2026-11-01 12:00']])
  const projects=[primary,other]
  await page.route('**/jiedan/portal/orders', r => ok(r, projects))
  for(const item of projects) {
    await page.route('**/jiedan/portal/orders/'+item.id, r => ok(r, item))
    await page.route('**/jiedan/portal/orders/'+item.id+'/version', r => ok(r, {id:item.id, version:item.version}))
  }
  await page.reload()
  await expect(page.getByRole('heading',{name:primary.title})).toBeVisible()
  return {primary, other}
}

function projectCard(page, name) {
  return page.locator('article.project').filter({has:page.getByRole('heading',{name,exact:true})})
}
function expectHomeTitles(card, titles) {
  return expect(card.locator('.request-row .request-main b')).toHaveText(titles)
}
function expectDetailIds(panel, ids) {
  return expect.poll(()=>panel.locator('.bug-item').evaluateAll(items=>items.map(el=>el.id))).toEqual(ids.map(id=>'requirement-'+id))
}

for (const width of [390,1440]) {
  test('客户首页按提交时间降序，组合筛选独立于其他项目，返回保留条件 · '+width, async ({page}) => {
    await visit(page,width)
    const main=projectCard(page,'行程系统'), other=projectCard(page,'票务系统')
    const showFilters=async()=>{
      const toggle=main.getByRole('button',{name:'筛选',exact:true})
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
    }
    await showFilters()
    const time = main.getByRole('group',{name:'行程系统提交时间'})
    const state = main.getByRole('group',{name:'行程系统需求状态'})
    await expectHomeTitles(main,['更新酒店名称','调整按钮位置','补充路线信息','增加人数选项','更换车站图片','历史价格表','导入记录'])
    await time.getByRole('button',{name:'近 1 天'}).click()
    await expectHomeTitles(main,['更新酒店名称','调整按钮位置','补充路线信息'])
    await state.getByRole('button',{name:/^未解决/}).click()
    await expectHomeTitles(main,['调整按钮位置','补充路线信息'])
    await time.getByRole('button',{name:'近 3 天'}).click()
    await expectHomeTitles(main,['调整按钮位置','补充路线信息','增加人数选项','更换车站图片'])
    await expectHomeTitles(other,['票务结算'])
    await expect(main.getByRole('group',{name:'行程系统细分状态'})).toHaveCount(0)
    const search=page.getByRole('searchbox')
    await search.fill('图片')
    await main.locator('.request-row').click()
    await expect(page.locator('#requirement-50')).toContainText('更换车站图片')
    await page.getByRole('button',{name:'返回列表'}).click()
    await expect(search).toHaveValue('图片')
    await showFilters()
    await expect(time.getByRole('button',{name:'近 3 天'})).toHaveAttribute('aria-pressed','true')
    await expect(state.getByRole('button',{name:/^未解决/})).toHaveAttribute('aria-pressed','true')
    await time.getByRole('button',{name:'近 1 天'}).click()
    await expect(main.locator('.request-row')).toHaveCount(0)
    await main.getByRole('button',{name:'清除筛选'}).click()
    await expect(search).toHaveValue('图片')
    await expectHomeTitles(main,['更换车站图片'])
    await noOverflow(page)
  })

  test('客户详情解决后及时移出未解决列表，历史通知可打开目标需求 · '+width, async ({page}) => {
    const {primary}=await visit(page,width)
    await page.goto('/#/projects/1?tab=bugs')
    const panel=page.locator('.bug-section')
    const time=panel.getByRole('group',{name:'按提交时间筛选'})
    const state=panel.getByRole('group',{name:'按解决状态筛选'})
    await expectDetailIds(panel,[20,4,8,24,50,55,70])
    await time.getByRole('button',{name:'近 1 天'}).click()
    await state.getByRole('button',{name:'未解决',exact:true}).click()
    await expectDetailIds(panel,[4,8])
    const updates=[]
    await page.route('**/jiedan/portal/bug/8/status',route=>{
      updates.push(route.request().postDataJSON().status)
      primary.version++
      Object.assign(primary.bugs.find(item=>item.id===8), {progressStatus:'resolved',status:'resolved'})
      primary.requirements.find(item=>item.id===8).status='resolved'
      return ok(route,primary)
    })
    await panel.locator('#requirement-8').getByRole('button',{name:'确认已解决'}).click()
    await expectDetailIds(panel,[4])
    expect(updates).toEqual(['resolved'])
    await state.getByRole('button',{name:'已解决',exact:true}).click()
    await expectDetailIds(panel,[20,8])
    await page.evaluate(()=>{location.hash='/projects/1?tab=bugs&issue=55'})
    await expectDetailIds(panel,[55])
    await expect(panel.locator('#requirement-55')).toContainText('历史价格表')
    await page.evaluate(()=>{location.hash='/projects/2?tab=bugs'})
    await expectDetailIds(panel,[99])
    await noOverflow(page)
  })
}

test('提交页最近三条与项目清单使用相同的顺序',async({page})=>{
  await visit(page,390)
  await projectCard(page,'行程系统').getByRole('button',{name:'提需求',exact:true}).click()
  const recent=page.getByRole('complementary',{name:'此项目最近提交的需求'})
  await expect(recent.locator('a strong')).toHaveText(['更新酒店名称','调整按钮位置','补充路线信息'])
  await recent.getByRole('link',{name:/调整按钮位置/}).click()
  await expect(page.locator('#requirement-4')).toBeVisible()
})
