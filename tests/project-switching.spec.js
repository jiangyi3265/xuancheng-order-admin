const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const oldProject = {...order, id:1, title:'官网一期', unread:[]}
const newProject = {...order, id:2, title:'门店小程序', unread:[]}
const ok = (route, data) => route.fulfill({json:{code:200,data}})
async function setup(page, role='boss') {
  await fixture(page, role)
  await page.addInitScript(role=>{
    localStorage.setItem(role==='customer' ? 'customerToken' : 'token','fixture-'+role)
    localStorage.setItem('xc.orderView','kanban')
  },role)
  await page.route('**/jiedan/order/list',r=>ok(r,[oldProject,newProject]))
  await page.route('**/jiedan/order/1',r=>ok(r,oldProject))
  await page.route('**/jiedan/order/2',r=>ok(r,newProject))
  await page.route('**/jiedan/order/read',r=>ok(r,{id:r.request().postDataJSON().id,version:2}))
}
test('全屏看板的状态计数与搜索结果一致，返回保留搜索词',async({page})=>{
  await setup(page)
  await page.setViewportSize({width:1280,height:720})
  await page.goto('/#/order')
  const search=page.getByPlaceholder('搜项目名 / 客户 / 联系方式 / 需求')
  await search.fill('门店')
  const group=page.locator('.qchip').filter({hasText:'进行中'})
  await expect(group.locator('b')).toHaveText('1')
  await group.click()
  const dialog=page.getByRole('dialog',{name:'全屏看板'})
  await expect(dialog.locator('.focus-open')).toHaveCount(1)
  await dialog.getByRole('button',{name:'返回看板'}).click()
  await expect(search).toHaveValue('门店')
})
test('切换项目时旧回复和附件不会出现在新项目',async({page})=>{
  await setup(page)
  await page.goto('/#/order?id=1&tab=chat')
  const field=page.getByRole('textbox',{name:'回复客户'})
  await field.fill('只给一期客户的草稿')
  await page.route('**/jiedan/media/upload',r=>ok(r,{url:'/app-icon-192.png',type:'image',ext:'png'}))
  await page.getByRole('button',{name:'选择表情或表情包'}).click()
  await page.getByRole('button',{name:'添加表情包收到'}).click()
  await expect(page.locator('.chat-panel .media-thumb')).toHaveCount(1)
  await page.evaluate(()=>location.hash='/order?id=2&tab=chat')
  await expect(page.locator('.workspace-head h2')).toHaveText(newProject.title)
  await expect(field).toHaveValue('')
  await expect(page.locator('.chat-panel .media-thumb')).toHaveCount(0)
})
test('客户端连续打开两条项目链接时，回复发给当前项目',async({page})=>{
  await setup(page,'customer')
  await page.route('**/jiedan/portal/orders/1',r=>ok(r,oldProject))
  await page.route('**/jiedan/portal/orders/2',r=>ok(r,newProject))
  const sent=[]
  await page.route('**/jiedan/portal/message',r=>{sent.push(r.request().postDataJSON());return ok(r,newProject)})
  await page.goto('/#/projects/1')
  await expect(page.locator('.tt strong')).toHaveText(oldProject.title)
  await page.evaluate(()=>location.hash='/projects/2')
  await expect(page.locator('.tt strong')).toHaveText(newProject.title)
  await page.getByRole('button',{name:'沟通',exact:true}).click()
  const field=page.getByRole('textbox',{name:'项目沟通消息'})
  await field.fill('这里是门店项目')
  await field.press('Enter')
  await expect(field).toHaveValue('')
  expect(sent.map(m=>String(m.orderId))).toEqual(['2'])
})

test('已读后晚到的旧列表不会恢复红点，后续新消息仍会置顶',async({page})=>{
  await setup(page)
  const row={...oldProject,unread:[1],version:10}
  let stamp=1
  let pendingList
  await page.route('**/jiedan/order/stamp',r=>ok(r,{stamp:String(stamp)}))
  await page.route('**/jiedan/order/list',async r=>{
    const snapshot=[{...row}]
    if(stamp===2) {pendingList=r; return}
    await ok(r,snapshot)
  })
  await page.route('**/jiedan/order/1',r=>ok(r,row))
  await page.route('**/jiedan/order/1/version',r=>ok(r,{id:1,version:row.version}))
  await page.route('**/jiedan/order/read',r=>{
    row.unread=[]; row.version=11
    return ok(r,{id:1,version:11})
  })
  await page.goto('/#/order')
  const card=page.locator('.kanban .card').filter({hasText:oldProject.title})
  await expect(card.locator('.new-badge')).toHaveText('新提醒')
  stamp=2
  await page.evaluate(()=>dispatchEvent(new Event('focus')))
  await expect.poll(()=>!!pendingList).toBe(true)
  await card.click()
  await expect.poll(()=>row.version).toBe(11)
  await page.getByRole('button',{name:'关闭项目详情'}).click()
  await expect(card.locator('.new-badge')).toHaveCount(0)
  const oldResponse=page.waitForResponse(r=>r.url().includes('/jiedan/order/list'))
  await ok(pendingList,[{...oldProject,version:10,unread:[1]}])
  await (await oldResponse).finished()
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))))
  await expect(card.locator('.new-badge')).toHaveCount(0)
  stamp=3;row.version=12;row.unread=[1]
  await page.evaluate(()=>dispatchEvent(new Event('focus')))
  await expect(card.locator('.new-badge')).toHaveText('新提醒')
})

test('看较早的报价聊天时收到新回复，点回最新消息才算已读',async({page})=>{
  await setup(page)
  const q={id:15,title:'聊天已读检查',creatorId:1,employeeId:2,version:1,status:'pending',replyVersion:0,conversationVersion:30}
  const items=Array.from({length:30},(_,idx)=>({id:idx+1,authorId:2,recipientId:1,authorName:'同事',content:'记录 '+(idx+1)}))
  const read=[]
  await page.route('**/jiedan/quote/**',async r=>{
    const path=new URL(r.request().url()).pathname
    if(path.endsWith('/read')){
      read.push(r.request().postDataJSON()[0].replyVersion)
      q.replyVersion=0
    }
    return ok(r,path.endsWith('/list')?[q]:path.endsWith('/conversation')?{items,hasMore:false}:q)
  })
  await page.goto('/#/quotes?id=15&tab=chat')
  const log=page.getByRole('log')
  await expect(log.locator('article').last()).toBeInViewport()
  await log.evaluate(el=>el.scrollTop=0)
  items.push({id:31,authorId:2,recipientId:1,authorName:'同事',content:'新的回复'})
  q.conversationVersion=q.replyVersion=31
  await page.evaluate(()=>dispatchEvent(new Event('focus')))
  await expect(log.locator('article').last()).toContainText('新的回复')
  await expect(log.locator('article').first()).toBeInViewport()
  expect(read).toEqual([])
  await page.getByRole('button',{name:'查看新回复'}).click()
  await expect(log.locator('article').last()).toBeInViewport()
  await expect.poll(()=>read.includes(31)).toBe(true)
})

async function openOrderStore(page) {
  // Call the same public actions without the layout's periodic refreshes so the
  // deliberately out-of-order responses cannot be overtaken by an unrelated poll.
  await page.route('**/order-store-check', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Store check</title>'}))
  await page.goto('/order-store-check')
  await page.evaluate(async () => { window.orderStore = await import('/src/mock/store.js') })
}

function issueSummary(version, count) {
  return {id:1, version, title:'项目版本 '+version, actionBugCount:count, unread:[]}
}
function issueDetail(version, status) {
  return {...issueSummary(version, status === 'action' ? 1 : 0),
    bugs:[{id:3,status}], timeline:[{id:version}], attachments:[{name:'附件'+version}],
    payments:[{id:version}], collaborators:[{id:version}], nextOwnerName:'同事'+version}
}

test('解决问题后，晚到的旧详情和旧列表不会恢复待处理状态和计数', {tag:'@source'}, async ({page}) => {
  await openOrderStore(page)
  const before = issueDetail(10,'action')
  const after = issueDetail(11,'resolved')
  let heldDetail, heldList, delay = false
  await page.route('**/jiedan/order/1', r => { if (delay) heldDetail = r; else return ok(r,before) })
  await page.route('**/jiedan/order/list', r => { heldList = r })
  await page.route('**/jiedan/order/bug/3/status', r => ok(r,after))
  await page.evaluate(() => window.orderStore.getOrder(1))
  delay = true
  await page.evaluate(() => {
    window.oldDetail = window.orderStore.getOrder(1)
    window.oldList = window.orderStore.loadOrders()
  })
  await expect.poll(() => Boolean(heldDetail && heldList)).toBe(true)
  await page.evaluate(() => window.orderStore.updateBugStatus(3,'resolved'))
  await ok(heldDetail,before)
  const afterDetail = await page.evaluate(async () => { await window.oldDetail; return window.orderStore.orders[0] })
  await ok(heldList,[issueSummary(10,1)])
  const afterList = await page.evaluate(async () => { await window.oldList; return window.orderStore.orders[0] })
  for (const row of [afterDetail,afterList]) {
    expect(row).toMatchObject({version:11, title:'项目版本 11', actionBugCount:0, bugs:[{id:3,status:'resolved'}], timeline:[{id:11}]})
  }
})

test('新版列表先到时保留当前详情版本并只补齐详情字段，直到新版详情返回', {tag:'@source'}, async ({page}) => {
  await openOrderStore(page)
  let summary = {...issueSummary(12,0),unread:[2],myMention:{content:'请检查'}}
  let detail = issueDetail(10,'action')
  await page.route('**/jiedan/order/list', r => ok(r,[summary]))
  await page.route('**/jiedan/order/1', r => ok(r,detail))
  const get = () => page.evaluate(() => window.orderStore.getOrder(1))
  const list = () => page.evaluate(async () => (await window.orderStore.loadOrders())[0])
  await list()
  const partiallyLoaded = await get()
  expect(partiallyLoaded).toMatchObject({...detail,title:summary.title,actionBugCount:0,unread:[2],myMention:summary.myMention})
  summary = {...summary,version:13,title:'最新项目名'}
  const listed = await list()
  expect(listed).toMatchObject({version:10, title:summary.title, bugs:detail.bugs})
  detail = issueDetail(11,'resolved')
  const interim = await get()
  expect(interim).toMatchObject({...detail,title:summary.title,actionBugCount:0,unread:[2],myMention:summary.myMention})
  detail = {...issueDetail(13,'resolved'),title:summary.title,unread:[2]}
  expect(await get()).toMatchObject(detail)
})
