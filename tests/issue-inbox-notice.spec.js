const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

async function prepare(page, actor, previews) {
  await fixture(page, actor)
  await page.addInitScript(role => localStorage.setItem('token','fixture-' + role), actor)
  const project = {...order, actionBugCount:previews.length, actionBugPreviews:previews,
    bugs:previews.map(item=>({...item, status:'action'}))}
  const wrong = {...project, id:8, ownerId:1, title:'其他负责人的项目', actionBugPreviews:[{id:94,content:'别人的问题'}]}
  for (const [key, data] of [['list',[project,wrong]],['1',project],['1/version',{version:1}],['read',project]])
    await page.route('**/jiedan/order/' + key, r => r.fulfill({json:{code:200,data}}))
  return project
}

test('负责人弹窗逐条定位，稍后处理保留在铃铛且刷新不重复打扰', async ({page})=>{
  await prepare(page, 'employee', [{id:91, content:'修改首页按钮'}, {id:92,content:'核对新需求'}])
  await page.goto('/#/workbench')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(notice).toContainText('核对新需求')
  await expect(notice).not.toContainText('别人的问题')
  await notice.getByRole('button',{name:'稍后处理'}).click()
  await expect(notice).toContainText('修改首页按钮')
  await notice.getByRole('button',{name:'查看问题'}).click()
  await expect(page).toHaveURL(/id=1.*tab=bugs.*bug=91/)
  await expect(page.locator('.bug-item.notice-target')).toContainText('修改首页按钮')
  await page.goto('/#/workbench'); await page.reload()
  await expect(page.locator('.pending-bell')).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.locator('.pending-bell').click()
  await expect(page.locator('.bell-panel')).toContainText('核对新需求')
})

test('一键处理传入当前问题和项目版本，重复点击只提交一次',async({page})=>{
  const project=await prepare(page,'employee',[{id:91,content:'请调整颜色'}])
  const submitted=[]
  await page.route('**/jiedan/order/1/pending-completion',async r=>{
    submitted.push(r.request().postDataJSON())
    await new Promise(resolve=>setTimeout(resolve,120))
    await r.fulfill({json:{code:200,data:{...project,version:2,actionBugCount:0,actionBugPreviews:[],bugs:[{id:91,status:'resolved'}]}}})
  })
  await page.goto('/#/workbench')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  const button=notice.getByRole('button',{name:'标为已处理'})
  await button.click()
  await expect(notice).toHaveCount(0)
  expect(submitted).toEqual([{kind:'bug',bugId:91,version:1}])
})

test('稍后处理 30 分钟使用第一次点选的时间，刷新后准时重新显示且仍可直接处理', async ({ page }) => {
  await prepare(page, 'employee', [{ id: 91, content: '核对交付截图' }])
  await page.clock.install({ time: new Date('2026-11-10T10:00:00Z') })
  await page.goto('/#/workbench')
  const notice = page.getByRole('region', { name: '需要我处理的问题' })
  await notice.getByRole('button', { name: /稍后处理.*30 分钟/ }).click()
  await expect(page.getByText('已稍后处理，30 分钟后提醒', { exact: true })).toBeVisible()
  await page.clock.fastForward(20 * 60 * 1000)
  await page.reload()
  await expect(page.locator('.pending-bell')).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.clock.fastForward(9 * 60 * 1000)
  await expect(notice).toHaveCount(0)
  await page.clock.fastForward(60 * 1000)
  await expect(notice).toContainText('核对交付截图')
  await expect(notice.getByRole('button', { name: '标为已处理' })).toBeEnabled()
})

test('已由他人处理的问题到期后不重新弹出，重新激活后可再次提醒', async ({ page }) => {
  const project = await prepare(page, 'employee', [{ id: 91, content: '检查再次提交' }])
  await page.clock.install({ time: new Date('2026-11-10T10:00:00Z') })
  await page.goto('/#/workbench')
  const notice = page.getByRole('region', { name: '需要我处理的问题' })
  await notice.getByRole('button', { name: /稍后处理/ }).click()
  let resolved = true
  let checked = 0
  await page.route('**/jiedan/order/list', route => {
    checked++
    const data = resolved
      ? [{ ...project, version: 2, actionBugCount: 0, actionBugPreviews: [] }]
      : [{ ...project, version: 3 }]
    return route.fulfill({ json: { code: 200, data } })
  })
  await page.clock.fastForward(30 * 60 * 1000)
  await expect.poll(() => checked).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('xc:issue-notices:2'))).toBe('{}')
  await expect(notice).toHaveCount(0)
  resolved = false
  await page.route('**/jiedan/order/stamp', route => route.fulfill({ json: { code: 200, data: { stamp: '3' } } }))
  await page.clock.fastForward(10_000)
  await expect(notice).toContainText('检查再次提交')
})

test('同一浏览器换账号后不会继承其他负责人的稍后时间', async ({ page }) => {
  await prepare(page, 'employee', [{ id: 91, content: '已分配的问题' }])
  await page.goto('/#/workbench')
  const notice = page.getByRole('region', { name: '需要我处理的问题' })
  await notice.getByRole('button', { name: /稍后处理/ }).click()
  await page.reload()
  await expect(page.locator('.pending-bell')).toBeVisible()
  await expect(notice).toHaveCount(0)
  await page.route('**/jiedan/staff/me', r => r.fulfill({ json: {
    code: 200, data: { id: 1, userName: 'boss', nickName: '管理员', role: 'boss', status: '0' }
  } }))
  await page.route('**/jiedan/order/list', r => r.fulfill({ json: { code: 200, data: [
    { ...order, ownerId: 1, actionBugCount: 1, actionBugPreviews: [{ id: 91, content: '转交给新负责人' }] }
  ] } }))
  await page.reload()
  await expect(notice).toContainText('转交给新负责人')
})

test('到期离线时保留稍后记录，恢复连接后重新核对负责人再提醒', async ({ page }) => {
  const project = await prepare(page, 'employee', [{ id: 91, content: '待联网确认' }])
  await page.clock.install({ time: new Date('2026-11-10T10:00:00Z') })
  await page.goto('/#/workbench')
  const notice = page.getByRole('region', { name: '需要我处理的问题' })
  await notice.getByRole('button', { name: /稍后处理/ }).click()
  let connected = false
  let checks = 0
  await page.route('**/jiedan/order/list', route => {
    checks++
    return connected
      ? route.fulfill({ json: { code: 200, data: [project] } })
      : route.fulfill({ status: 503, json: { code: 503, msg: '连接暂不可用' } })
  })
  await page.clock.fastForward(30 * 60 * 1000)
  await expect.poll(() => checks).toBeGreaterThan(0)
  await expect(notice).toHaveCount(0)
  connected = true
  await page.clock.fastForward(31_000)
  await expect(notice).toContainText('待联网确认')
})

test('客户新问题在项目已读后仍进待办，消息和提醒定位同一条',async({page})=>{
  const project=await prepare(page,'employee',[])
  Object.assign(project,{unread:[],newBugCount:1,newBugPreview:{id:93,content:'核对轮播图'},bugs:[{id:93,content:'核对轮播图',status:'open',senderKind:'customer'}]})
  await page.route('**/jiedan/order/list',r=>r.fulfill({json:{code:200,data:[project]}}))
  await page.goto('/#/workbench')
  await expect(page.getByText('客户提了 1 条新问题：核对轮播图',{exact:true}).first()).toBeVisible()
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(notice).toContainText('客户提了新问题 #93')
  await notice.getByRole('button',{name:'稍后处理'}).click()
  await page.goto('/#/messages')
  await page.getByText('客户提了新问题：核对轮播图',{exact:true}).click()
  await expect(page).toHaveURL(/tab=bugs.*bug=93/)
})

test('客户的两条未标记问题可以一起加入处理并撤销',async({page})=>{
  const project=await prepare(page,'employee',[])
  Object.assign(project,{bugs:[91,92].map(id=>({id,status:'open',senderKind:'customer',content:'客户问题'+id}))})
  function summary(){
    const pending=project.bugs.filter(b=>b.status==='open')
    return {...project,newBugCount:pending.length,newBugPreview:pending.at(-1),actionBugCount:2-pending.length,
      actionBugPreviews:project.bugs.filter(b=>b.status==='action')}
  }
  for(const path of ['list','1'])await page.route('**/jiedan/order/'+path,r=>r.fulfill({json:{code:200,data:path==='list'?[summary()]:summary()}}))
  await page.route('**/jiedan/order/bug/*/status',r=>{
    const id=Number(r.request().url().split('/').at(-2));project.bugs.find(b=>b.id===id).status=r.request().postDataJSON().status
    return r.fulfill({json:{code:200,data:summary()}})
  })
  await page.goto('/#/workbench')
  await page.getByRole('button',{name:'都加入处理',exact:true}).click()
  await expect(page.getByText('2 条问题已标记需处理',{exact:true}).first()).toBeVisible()
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.getByRole('button',{name:'都加入处理',exact:true})).toBeVisible()
  expect(project.bugs.map(b=>b.status)).toEqual(['open','open'])
})
