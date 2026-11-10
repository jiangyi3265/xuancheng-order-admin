const {test, expect}=require('@playwright/test')
const {fixture, order, noOverflow}=require('./fixtures.cjs')

const image=n=>({name:'行程截图'+n+'.png',type:'image',url:'/app-icon-192.png?trip='+n})
const pictures=[image(1),image(2)]
function demo(){
  const reply={id:83,content:'到店按钮已经换好',time:'2026-11-08 10:30',hasAttachments:false,unread:true}
  return {...order,id:4,title:'袋鼠旅游',lastMessage:{id:12,type:'reply',content:'项目沟通原文',time:'2026-11-08 10:29'},messageCount:1,
    requirements:[
      {id:77,title:'修改到店按钮',status:'open',submittedAt:'2026-11-08 10:00',firstImage:pictures[0],imageCount:2,latestTeamReply:reply},
      {id:65,title:'升级路线图',status:'resolved',submittedAt:'2026-11-06 09:00',imageCount:0}
    ],
    bugs:[{id:77,content:'修改到店按钮',status:'open',time:'2026-11-08 10:00',attachments:pictures,updates:[{...reply,createdBy:'项目团队',attachments:[]}]}]}
}
async function visit(page,width) {
  const project=demo()
  await page.clock.setFixedTime(new Date('2026-11-08T11:00:00+08:00'))
  await page.setViewportSize({width,height:780})
  await fixture(page,'customer')
  await page.addInitScript(()=>{localStorage.setItem('customerToken','fixture-customer');localStorage.setItem('customerAccount','customer')})
  const reply=(r,data)=>r.fulfill({json:{code:200,data}})
  await page.route('**/jiedan/portal/orders',r=>reply(r,[project]))
  await page.route('**/jiedan/portal/orders/4',r=>reply(r,project))
  await page.route('**/jiedan/portal/orders/4/version',r=>reply(r,{id:4,version:project.version}))
  await page.goto('/#/projects')
  await expect(page.getByRole('heading',{name:'我的需求',exact:true})).toBeVisible()
  return project
}

for(const width of [320,1440]){
  test('单项目紧凑首页、筛选与缩略图连续翻页 · '+width,async({page})=>{
    await visit(page,width)
    await expect(page.getByRole('heading',{name:'我的需求',exact:true})).toBeVisible()
    const filter=page.getByRole('button',{name:'筛选',exact:true})
    await expect(filter).toHaveAttribute('aria-expanded','false')
    await expect(page.getByRole('button',{name:'近 1 天',exact:true})).toHaveCount(0)
    await filter.click()
    await page.getByRole('button',{name:'近 1 天',exact:true}).click()
    await expect(page.locator('.request-entry')).toHaveCount(1)
    await filter.click()
    await page.getByRole('button',{name:'取消近 1 天筛选'}).click()
    await expect(page.locator('.request-entry')).toHaveCount(2)
    await page.getByRole('button',{name:'查看需求 #77 的图片，共 2 张'}).click()
    const gallery=page.locator('.fullscreen-image')
    await expect(gallery.locator('.gallery-count')).toHaveText('1 / 2')
    await gallery.getByRole('button',{name:'下一张图片'}).click()
    await expect(gallery.getByRole('img',{name:'行程截图2.png'})).toBeVisible()
    await gallery.getByRole('button',{name:'关闭图片预览'}).click()
    await expect(page).toHaveURL(/#\/projects$/)
    await noOverflow(page)
    await page.getByRole('link').filter({hasText:'到店按钮已经换好'}).click()
    await expect(page).toHaveURL(/#\/projects\/4\?tab=bugs&issue=77&update=83$/)
  })
}
test('列表只读，消息中心的沟通与需求回复分别进入正确位置',async({page})=>{
  await visit(page,390)
  const writes=[]
  page.on('request',r=>{if(r.method()!=='GET' && r.url().includes('/jiedan/portal/'))writes.push(r.url())})
  await page.getByRole('link',{name:'消息',exact:true}).click()
  const issue=page.locator('.message-card').filter({hasText:'到店按钮已经换好'})
  const chat=page.locator('.message-card').filter({hasText:'项目沟通原文'})
  await expect(issue.locator('.unread-dot')).toBeVisible()
  await expect(issue).toHaveAttribute('href',/#\/projects\/4\?tab=bugs&issue=77&update=83$/)
  await expect(chat).toHaveAttribute('href',/#\/projects\/4\?tab=chat$/)
  await page.getByRole('button',{name:'刷新'}).click()
  await expect(issue.locator('.unread-dot')).toBeVisible()
  expect(writes).toEqual([])
  await chat.click()
  await expect(page).toHaveURL(/#\/projects\/4\?tab=chat$/)
})
test('图片详情暂时断线时仍能打开首图，从预览返回留在原列表',async({page})=>{
  await visit(page,390)
  await page.route('**/jiedan/portal/orders/4',r=>r.fulfill({json:{code:500,msg:'暂时断开'}}))
  await page.getByRole('button',{name:'查看需求 #77 的图片，共 2 张'}).click()
  await expect(page.getByRole('dialog',{name:'行程截图1.png'})).toBeVisible()
  await page.getByRole('button',{name:'关闭图片预览'}).click()
  await expect(page).toHaveURL(/#\/projects$/)
})

test('已读回执只影响本账号的对应需求，晚到的列表不会恢复旧红点或吞掉新回复',async({page})=>{
  const project=await visit(page,390)
  project.requirements[1].latestTeamReply={id:70,content:'另一条回复',time:'2026-11-08 09:00',unread:true}
  const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  const fulfill=(route)=>route.fulfill({json:{code:200,data:[project]}})
  await page.route('**/jiedan/portal/orders',fulfill)
  await refresh()
  const first=page.locator('.request-entry').filter({hasText:'修改到店按钮'})
  const other=page.locator('.request-entry').filter({hasText:'升级路线图'})
  await expect(other.locator('.unread')).toHaveCount(1)
  let pending
  await page.route('**/jiedan/portal/orders',route=>{pending=route})
  await refresh()
  await expect.poll(()=>!!pending).toBe(true)
  const confirm=account=>page.evaluate(account=>window.dispatchEvent(new CustomEvent('customer-issue-reply-read',{
    detail:{account,projectId:4,issueId:77,updateId:83}
  })),account)
  await confirm('someone-else')
  await expect(first.locator('.unread')).toHaveCount(1)
  await confirm('customer')
  await expect(first.locator('.unread')).toHaveCount(0)
  await expect(other.locator('.unread')).toHaveCount(1)
  await fulfill(pending)
  await expect(first.locator('.unread')).toHaveCount(0)
  project.requirements[0].latestTeamReply={...project.requirements[0].latestTeamReply,id:92,content:'更新的补充'}
  await page.route('**/jiedan/portal/orders',fulfill)
  await expect(async()=>{
    await refresh()
    await expect(first.locator('.reply-link')).toContainText('更新的补充',{timeout:400})
  }).toPass()
  await expect(first.locator('.unread')).toHaveCount(1)
})
