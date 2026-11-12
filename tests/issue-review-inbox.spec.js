const { test, expect } = require('@playwright/test')
const { fixture, order, noOverflow } = require('./fixtures.cjs')

const pending=(id,title,reviewId)=>({id,title,status:'confirm',reviewId,reviewTime:'2026-11-08 11:00'})
const project={...order,requirements:[pending(8,'第一次确认',63),pending(12,'第二次确认',64),
  {id:13,title:'普通补充',status:'action',latestTeamReply:{id:65,content:'已收到',unread:true}}]}
async function visit(page,projects,width) {
  await page.setViewportSize({width,height:820})
  await fixture(page,'customer')
  await page.addInitScript(()=>{localStorage.setItem('customerToken','fixture-customer');localStorage.setItem('customerAccount','client')})
  await page.route('**/jiedan/portal/orders',r=>r.fulfill({json:{code:200,data:projects}}))
  await page.goto('/#/projects')
}
for(const width of [360,1440]) {
  test('确认入口独立于搜索、按轮次清除，并跟随单项目导航 · '+width,async({page})=>{
    await visit(page,[project],width)
    const inbox=page.getByRole('region',{name:'等我确认'})
    const nav=page.getByRole('navigation',{name:'客户导航'})
    await expect(nav.getByRole('link',{name:'我的需求'})).toBeVisible()
    await page.getByRole('searchbox').fill('不存在')
    await inbox.locator('summary').click()
    await expect(inbox.getByRole('link')).toHaveCount(2)
    await expect(inbox.getByRole('link').first()).toHaveAttribute('href',/#\/projects\/1\?tab=bugs&issue=12&review=64$/)
    await expect(inbox.getByRole('link').last()).toHaveAttribute('href',/#\/projects\/1\?tab=bugs&issue=8&review=63$/)
    const receipt=(account,issueId,reviewId)=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('customer-issue-reviewed',{detail})),{account,projectId:1,issueId,reviewId,status:'resolved'})
    await receipt('someone-else',8,63)
    await receipt('client',12,48)
    await expect(inbox.getByRole('link')).toHaveCount(2)
    await receipt('client',12,64)
    await expect(inbox.getByRole('link')).toHaveCount(1)
    await expect(inbox.getByRole('link')).toHaveAccessibleName(/等我确认（1） #8 第一次确认/)
    await receipt('client',8,63)
    await expect(inbox).toHaveCount(0)
    await receipt('client',8,50)
    await Promise.all([
      page.waitForResponse(response=>response.url().endsWith('/jiedan/portal/orders')),
      page.evaluate(()=>window.dispatchEvent(new Event('focus')))
    ])
    await expect(inbox).toHaveCount(0)
    await nav.getByRole('link',{name:'提交需求'}).click()
    await expect(nav.getByRole('link',{name:'我的需求'})).toBeVisible()
    await noOverflow(page)
  })
}
test('多项目的确认项标明所属项目，无绑定时没有确认入口',async({page})=>{
  const second={...order,id:2,title:'第二个项目',requirements:[pending(44,'另一项确认',72)]}
  await visit(page,[project,second],390)
  await expect(page.getByRole('heading',{name:'我的项目',exact:true})).toBeVisible()
  const inbox=page.getByRole('region',{name:'等我确认'})
  await inbox.locator('summary').click()
  await expect(inbox.getByRole('link',{name:/另一项确认.*第二个项目/})).toHaveAttribute('href',/#\/projects\/2\?tab=bugs&issue=44&review=72$/)
  await page.route('**/jiedan/portal/orders',r=>r.fulfill({json:{code:200,data:[]}}))
  await page.reload()
  await expect(page.getByText('请联系团队绑定项目',{exact:false})).toBeVisible()
  await expect(inbox).toHaveCount(0)
})

test('团队能选客户补图作对照，重试沿用同一轮，发送后等客户确认',async({page})=>{
  const image=name=>({name:name+'.png',type:'image',url:'/app-icon-192.png?'+name})
  const issue={id:11,status:'action',content:'请修改标题',time:'2026-11-08 10:30',attachments:[image('原图')],
    updates:[{id:21,senderKind:'customer',time:'2026-11-08 10:35',content:'看这张',attachments:[image('客户补图')]},
      {id:22,senderKind:'staff',time:'2026-11-08 10:40',content:'过程稿',attachments:[image('团队补图')]}]}
  const item={...order,bugs:[issue],actionBugCount:1,unread:[]}
  const ok=(r,data)=>r.fulfill({json:{code:200,data}})
  await fixture(page,'employee')
  await page.addInitScript(()=>localStorage.setItem('token','fixture-employee'))
  for(const [url,data] of [['list',[item]],['1',item],['read',{id:1}],['1/version',{version:1}]]) {
    await page.route('**/jiedan/order/'+url,r=>ok(r,data))
  }
  const requests=[]
  await page.route('**/jiedan/order/bug/11/review',async r=>{
    requests.push(r.request().postDataJSON())
    if(requests.length===1) return r.fulfill({json:{code:500,msg:'暂时不可用'}})
    issue.status='confirm'; issue.review={id:51,state:'pending'}; item.version++; item.actionBugCount=0
    return ok(r,item)
  })
  await page.goto('/#/order?id=1&tab=bugs&bug=11')
  const card=page.locator('.bug-item[data-notice-id="11"]')
  await card.getByRole('button',{name:'请客户确认'}).click()
  const dialog=page.getByRole('dialog',{name:'请客户确认'})
  const submit=dialog.getByRole('button',{name:'发送确认请求'})
  // 说明和截图都可以不填（客户看到「请确认这次修改」），按钮一开始就能点
  await expect(submit).toBeEnabled()
  await expect(dialog.getByRole('button',{name:/选择改前截图/})).toHaveCount(2)
  await dialog.getByRole('button',{name:/选择改前截图.*客户补图/}).click()
  await dialog.getByRole('textbox',{name:'修改说明'}).fill('标题已修好')
  await submit.click()
  await expect(dialog.getByRole('alert')).toContainText('暂时不可用')
  await expect(dialog.getByRole('textbox',{name:'修改说明'})).toHaveValue('标题已修好')
  await submit.click()
  await expect(dialog).toBeHidden()
  await expect(card.locator('.issue-awaiting')).toBeVisible()
  await expect(card.getByRole('button',{name:'请客户确认'})).toHaveCount(0)
  await expect(card.getByRole('radio')).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[0].requestKey).toBeTruthy()
  expect(requests[1]).toEqual(requests[0])
  expect(requests[1]).toMatchObject({beforeUrl:image('客户补图').url,content:'标题已修好',previousReviewId:null})
})

test('确认回执消除同轮及更早红点，延迟列表和后续普通回复互不影响',async({page})=>{
  const reply=(id,content)=>({id,content,time:'2026-11-08 11:00',unread:true})
  const first={...pending(8,'第一项',63),latestTeamReply:reply(63,'请确认上次修改')}
  const second={...pending(12,'第二项',64),latestTeamReply:reply(62,'先前的补充')}
  const items={...order,requirements:[first,second]}
  await visit(page,[items],390)
  const unread=page.locator('.request-entry .unread')
  await expect(unread).toHaveCount(2)
  let delayed
  await page.route('**/jiedan/portal/orders',route=>{delayed=route},{times:1})
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await refresh()
  await expect.poll(()=>!!delayed).toBe(true)
  const receipt=(issueId,reviewId)=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('customer-issue-reviewed',{detail})),{account:'client',projectId:1,status:'action',issueId,reviewId})
  await receipt(8,63)
  await receipt(12,64)
  await expect(unread).toHaveCount(0)
  await delayed.fulfill({json:{code:200,data:[items]}})
  await expect(unread).toHaveCount(0)
  await page.getByRole('navigation',{name:'客户导航'}).getByRole('link',{name:'消息'}).click()
  await expect(page.locator('.message-card .unread-dot')).toHaveCount(0)
  first.latestTeamReply=reply(89,'刚发的新补充')
  await expect(async()=>{
    await refresh()
    await expect(page.locator('.message-card').filter({hasText:'刚发的新补充'}).locator('.unread-dot')).toBeVisible({timeout:400})
  }).toPass()
  await expect(page.locator('.message-card .unread-dot')).toHaveCount(1)
})
