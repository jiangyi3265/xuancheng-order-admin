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
  await expect(page.locator('.handoff-card').filter({hasText:'核对新需求'})).toHaveCount(1)
  await expect(notice).toHaveCount(0)
  await page.goto('/#/order')
  await expect(notice).toContainText('核对新需求')
  await expect(notice).not.toContainText('别人的问题')
  await notice.getByRole('button',{name:'稍后处理'}).click()
  await expect(notice).toContainText('修改首页按钮')
  await notice.getByRole('link',{name:'看一下',exact:true}).click()
  await expect(page).toHaveURL(/id=1.*tab=bugs.*bug=91/)
  await expect(page.locator('.bug-item.notice-target')).toContainText('修改首页按钮')
  await page.goto('/#/order'); await page.reload()
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
  await page.goto('/#/order')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  const button=notice.getByRole('button',{name:'已解决',exact:true})
  await button.click()
  await expect(notice).toHaveCount(0)
  expect(submitted).toEqual([{kind:'bug',bugId:91,version:1}])
})

test('稍后处理 30 分钟使用第一次点选的时间，刷新后准时重新显示且仍可直接处理', async ({ page }) => {
  await prepare(page, 'employee', [{ id: 91, content: '核对交付截图' }])
  await page.clock.install({ time: new Date('2026-11-10T10:00:00Z') })
  await page.goto('/#/order')
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
  await expect(notice.getByRole('button', { name: '已解决', exact: true })).toBeEnabled()
})

for (const width of [390, 1366]) {
  test('点 × 表示看到了：30 分钟内整个提醒都不弹（新来的也不弹），刷新也算数，到点后照常弹 · ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 845 })
    const project = await prepare(page, 'employee', [{ id: 91, content: '修改首页按钮' }, { id: 92, content: '核对新需求' }])
    await page.clock.install({ time: new Date('2026-11-10T10:00:00Z') })
    // 电脑上项目管理已经列出，不弹；换到客户账号页看弹窗
    const where = width < 768 ? '/#/order' : '/#/customers'
    await page.goto(where)
    const notice = page.getByRole('region', { name: '需要我处理的问题' })
    await expect(notice).toContainText('2 条')
    const close = notice.getByRole('button', { name: '关闭，30 分钟内不再弹出', exact: true })
    // 手机上要好点：至少 40×40
    if (width < 768) expect(await close.evaluate(el => Math.min(el.offsetWidth, el.offsetHeight))).toBeGreaterThanOrEqual(40)
    await close.click()
    await expect(page.getByText('30 分钟内不再弹出，要处理的还在铃铛里', { exact: true })).toBeVisible()
    await expect(notice).toHaveCount(0)
    // 两条都还在铃铛里
    await page.locator('.pending-bell').click()
    await expect(page.locator('.bell-panel')).toContainText('修改首页按钮')
    await expect(page.locator('.bell-panel')).toContainText('核对新需求')
    await page.keyboard.press('Escape')
    // 期间来了一条新的，也先不弹；刷新、换页都不弹
    const fresh = { ...project, version: 2, actionBugCount: 3, actionBugPreviews: [...project.actionBugPreviews, { id: 93, content: '新来的问题' }],
      bugs: [...project.bugs, { id: 93, content: '新来的问题', status: 'action' }] }
    await page.route('**/jiedan/order/list', r => r.fulfill({ json: { code: 200, data: [fresh] } }))
    await page.clock.fastForward(10 * 60 * 1000)
    await page.reload()
    await expect(page.locator('.pending-bell')).toBeVisible()
    await page.goto('/#/order?id=1')
    await page.goto(where)
    await page.clock.fastForward(19 * 60 * 1000)
    await expect(notice).toHaveCount(0)
    // 满 30 分钟，还没处理的照常弹出，新来的也在
    await page.clock.fastForward(61 * 1000)
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('3 条')
  })
}

test('× 只管自己这个账号：换了账号照常弹', async ({ page }) => {
  await prepare(page, 'employee', [{ id: 91, content: '已分配的问题' }])
  await page.goto('/#/order')
  const notice = page.getByRole('region', { name: '需要我处理的问题' })
  await notice.getByRole('button', { name: '关闭，30 分钟内不再弹出', exact: true }).click()
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

test('已由他人处理的问题到期后不重新弹出，重新激活后可再次提醒', async ({ page }) => {
  const project = await prepare(page, 'employee', [{ id: 91, content: '检查再次提交' }])
  await page.clock.install({ time: new Date('2026-11-10T10:00:00Z') })
  await page.goto('/#/order')
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
  await page.goto('/#/order')
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
  await page.goto('/#/order')
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
  await page.goto('/#/order')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(notice).toContainText('核对轮播图')
  await expect(notice).toContainText('#93')
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
  await expect(page.locator('.handoff-card[data-kind="bug"]')).toHaveCount(2)
  await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.getByRole('button',{name:'都加入处理',exact:true})).toBeVisible()
  expect(project.bugs.map(b=>b.status)).toEqual(['open','open'])
})

test('已经看过的问题退回后重新提醒，说明属于本次退回', async ({page}) => {
  const project = await prepare(page,'employee',[{id:91,content:'调整移动端按钮'}])
  const turn = { requesterId:1, requesterName:'发起人', returnedAt:'2026-11-11 10:12:00', returnNote:'请检查小屏幕换行' }
  project.taskTurns = {'bug-91':turn}
  await page.addInitScript(() => localStorage.setItem('xc:issue-notices:2',JSON.stringify({'1-bug-91':'viewed'})))
  await page.goto('/#/order')
  const popup = page.getByRole('region',{name:'需要我处理的问题'})
  await expect(popup).toContainText('发起人 退回')
  await expect(popup).toContainText(turn.returnNote)
  await expect(popup.getByRole('button',{name:'做完了'})).toBeVisible()
  await popup.getByRole('link',{name:'看一下',exact:true}).click()
  await expect(page.locator('.bug-item.notice-target .return-info')).toContainText(turn.returnNote)
})

for (const width of [390, 1366]) {
  test('交办问题可附说明，输入法选字和重复点击不会提前提交 · ' + width, async ({page})=>{
    await page.setViewportSize({width,height:845})
    const project=await prepare(page,'employee',[{id:91,content:'请核对消息提示'}])
    const turn={requesterId:1,requesterName:'发起人'}
    project.taskTurns={'bug-91':turn}
    const body=[]
    let finish
    await page.route('**/jiedan/order/1/pending-completion',async r=>{
      body.push(r.request().postDataJSON())
      if(body.length===1) return r.fulfill({json:{code:503,msg:'暂时没有提交成功'}})
      await new Promise(resolve=>{finish=resolve})
      return r.fulfill({json:{code:200,data:{...project,version:2,actionBugCount:0,actionBugPreviews:[],
        internalReviewIssues:[{id:91,content:'请核对消息提示'}],taskTurns:{'bug-91':{...turn,submittedAt:'2026-11-11 12:00:00',submittedBy:2,submitNote:'已经核对'}}}}})
    })
    // 电脑上项目管理的「待处理」面板已经列出这件事，不弹；换到客户账号页看弹窗
    await page.goto(width < 768 ? '/#/order' : '/#/customers')
    const popup=page.getByRole('region',{name:'需要我处理的问题'})
    await popup.getByRole('button',{name:'做完了',exact:true}).click()
    const note=page.getByRole('textbox',{name:/做了什么/})
    if(width===390) await expect(note).not.toBeFocused()
    else await expect(note).toBeFocused()
    await note.fill('已经核对')
    await note.dispatchEvent('keydown',{key:'Enter',isComposing:true})
    expect(body).toHaveLength(0)
    await note.press('Enter')
    await expect(page.getByText('暂时没有提交成功',{exact:true})).toBeVisible()
    await expect(note).toHaveValue('已经核对')
    const confirm=page.getByRole('form',{name:'提交处理结果'}).getByRole('button',{name:'提交',exact:true})
    await confirm.click()
    await expect(note).toBeDisabled()
    await confirm.evaluate(button=>button.click())
    expect(body).toEqual(Array(2).fill({kind:'bug',bugId:91,note:'已经核对',version:1}))
    finish()
    await expect(popup).toHaveCount(0)
  })
}

test('手机问题提醒可收起，列表新建按钮与弹出的表单仍能操作', async ({page})=>{
  await page.setViewportSize({width:390,height:720})
  await prepare(page,'employee',[{id:91,content:'更新首页按钮'}])
  await page.goto('/#/order')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(notice.getByText('更新首页按钮')).toBeVisible()
  await notice.getByRole('button',{name:'收起问题提醒'}).click()
  await expect(notice.getByText('更新首页按钮')).toHaveCount(0)
  await notice.getByRole('button',{name:'展开问题提醒'}).click()
  await page.getByRole('button',{name:'新建项目',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'新建项目',exact:true})
  await expect(dialog).toBeVisible()
  await expect(notice).toBeHidden()
  await dialog.getByRole('button',{name:'关闭此对话框',exact:true}).click()
  await notice.getByRole('button',{name:/稍后处理/}).click()
  await expect(notice).toHaveCount(0)
})

test('移动端有待处理问题时可从成员管理底栏打开新增成员表单',async({page})=>{
  await page.setViewportSize({width:390,height:720})
  await prepare(page,'boss',[{id:91,content:'需要核对'}])
  await page.goto('/#/staff')
  const notice=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(notice).toBeVisible()
  await page.getByRole('button',{name:'新增成员',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'新增成员',exact:true})).toBeVisible()
  await expect(notice).toBeHidden()
})

test('一件事只出现一次：电脑上项目管理已经在「待处理」里列出时不再弹窗，别的页面照常弹', async ({page})=>{
  await page.setViewportSize({width:1366,height:900})
  const project=await prepare(page,'employee',[{id:91,content:'请核对消息提示'}])
  project.taskTurns={'bug-91':{requesterId:1,requesterName:'发起人'}}
  await page.goto('/#/order')
  const popup=page.getByRole('region',{name:'需要我处理的问题'})
  await expect(page.locator('.pending-projects .handoff-card').filter({hasText:'请核对消息提示'})).toHaveCount(1)
  await expect(popup).toHaveCount(0)
  await page.goto('/#/customers')
  await expect(popup).toContainText('请核对消息提示')
  await page.goto('/#/order?id=1')
  await expect(popup).toContainText('请核对消息提示')
})
