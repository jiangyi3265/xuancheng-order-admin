const {test, expect} = require('@playwright/test')
const {login, order, noOverflow} = require('./fixtures.cjs')

const project = {
  ...order,
  requirements:[
    {id:31,title:'已更新页脚',status:'resolved',submittedAt:'2026-11-07 11:20'},
    {id:16,title:'修改到店按钮',status:'open',submittedAt:'2026-11-07 11:00'},
    {id:17,title:'订单列表的出发日期',status:'action',submittedAt:'2026-11-07 12:30'}
  ]
}
project.bugs = project.requirements.map(r=>({
  id:r.id,content:r.title,status:r.status==='resolved' ? 'resolved':'open',progressStatus:r.status,
  updates:[],attachments:[],time:r.submittedAt
}))
const ok=(route,data)=>route.fulfill({json:{code:200,data}})

test('先看新提交，可按编号进入一条需求，返回保留查询，失效链接能返回清单',async({page})=>{
  await page.setViewportSize({width:320,height:667})
  await login(page,'customer')
  await page.route('**/jiedan/portal/orders',r=>ok(r,[project]))
  await page.route('**/jiedan/portal/orders/1',r=>ok(r,project))
  await page.reload()
  const rows=page.locator('.request-row')
  await expect(rows.first()).toContainText('订单列表的出发日期')
  const search=page.getByRole('searchbox')
  await search.fill('＃16')
  await expect(rows).toHaveCount(1)
  await rows.click()
  await expect(page.locator('.bug-item')).toHaveCount(1)
  await expect(page.locator('#requirement-16')).toContainText('修改到店按钮')
  await page.getByRole('button',{name:'返回列表'}).click()
  await expect(search).toHaveValue('＃16')
  await search.fill('不存在的需求')
  await page.getByRole('button',{name:'清除搜索'}).click()
  await expect(rows).toHaveCount(3)
  await page.goto('/#/projects/1?tab=bugs&issue=999')
  await expect(page.getByRole('status').filter({hasText:'这条需求已移除或无法查看'})).toBeVisible()
  await page.getByRole('button',{name:'全部修改需求'}).click()
  await expect(page.locator('.bug-item')).toHaveCount(3)
  await page.getByRole('button',{name:'沟通',exact:true}).click()
  await page.reload()
  await expect(page.locator('.composer')).toBeVisible()
  await noOverflow(page)
})

test('项目刷新断线时继续填写，预算支持小数，回执显示需求内容',async({page})=>{
  await page.setViewportSize({width:390,height:844})
  await login(page,'customer')
  let online=true, posted
  await page.route('**/jiedan/portal/orders',r=>online ? ok(r,[project]) : r.fulfill({json:{code:503,msg:'断线'}}))
  await page.route('**/jiedan/order/intake',r=>{
    posted=r.request().postDataJSON()
    return ok(r,{id:1,bugId:44,title:project.title,createTime:'2026-11-08 12:40'})
  })
  await page.goto('/#/intake')
  const description=page.getByLabel('要改什么？')
  await description.fill('修改确认到店按钮')
  online=false
  await page.evaluate(()=>window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('status').filter({hasText:'可以继续填写'})).toBeVisible()
  await expect(description).toHaveValue('修改确认到店按钮')
  await page.locator('.extras summary').click()
  await page.getByRole('spinbutton').fill('128.50')
  await page.locator('.extras summary').click()
  online=true
  await page.getByRole('button',{name:'重试'}).click()
  await expect(page.locator('.sync-error')).toHaveCount(0)
  await page.getByRole('button',{name:'提交需求',exact:true}).click()
  await expect(page.locator('.receipt')).toContainText('修改确认到店按钮')
  expect(posted.contact).toBe('');expect(posted.amount).toBe(128.5)
  await page.getByRole('button',{name:'继续提需求'}).click()
  await expect(description).toBeFocused()
  await expect(description).toHaveValue('')
  await expect(page.locator('.extras')).not.toHaveAttribute('open','')
})

test('刷新过程中标为已解决，稍后返回的旧版本保留已完成状态',async({page})=>{
  await login(page,'customer')
  let reads=0, pending
  await page.route('**/jiedan/portal/orders/1',r=>{
    if (++reads===1) return ok(r,project)
    pending=r
  })
  await page.route('**/jiedan/portal/orders/1/version',r=>ok(r,{id:1,version:2}))
  await page.route('**/jiedan/portal/bug/17/status',r=>ok(r,{
    ...project,version:3,bugs:project.bugs.map(b=>b.id===17 ? {...b,status:'resolved',progressStatus:'resolved'} : b)
  }))
  await page.goto('/#/projects/1?tab=bugs&issue=17')
  const card=page.locator('#requirement-17')
  await expect(card).toBeVisible()
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect.poll(()=>!!pending).toBe(true)
  await card.getByRole('button',{name:'确认已解决'}).click()
  await expect(card.locator('.requirement-status')).toHaveText('已解决')
  await ok(pending,{...project,version:2})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await expect(card.locator('.requirement-status')).toHaveText('已解决')
})
