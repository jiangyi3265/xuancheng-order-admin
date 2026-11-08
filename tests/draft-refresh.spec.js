const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const ok = (route, data) => route.fulfill({json:{code:200, data}})
async function start(page, route, role='boss') {
  await fixture(page, role)
  await page.addInitScript(({role}) => {
    if (sessionStorage.getItem('test-started')) return
    localStorage.setItem(role === 'customer' ? 'customerToken' : 'token', 'fixture-' + role)
    sessionStorage.setItem('test-started','1')
  }, {role})
  if (route) await page.goto(route)
}

for (const customer of [false,true]) {
  test((customer ? '客户端' : '项目') + '刷新恢复文字与图片，仅成功发送才清空', async ({page})=>{
    const posted = []
    const url = customer ? '/#/projects/1?tab=chat' : '/#/order?id=1&tab=chat'
    await start(page,url,customer?'customer':'boss')
    await page.route('**/jiedan/media/upload',r=>ok(r,{url:'/jiedan/media/fixture.png',ext:'png'}))
    await page.route(customer?'**/jiedan/portal/message':'**/jiedan/order/progress',r=>{
      posted.push(r.request().postDataJSON())
      return ok(r,order)
    })
    const field=page.getByRole('textbox',{name:customer?'项目沟通消息':'回复客户'})
    const thumb=page.locator(customer?'.composer .media-thumb':'.chat-panel .media-thumb')
    await field.fill('等我确认交付时间')
    await page.getByRole('button',{name:'选择表情或表情包'}).click()
    await page.getByRole('button',{name:'添加表情包收到'}).click()
    await expect(thumb).toBeVisible()
    await page.reload()
    await expect(field).toHaveValue('等我确认交付时间')
    await expect(thumb).toBeVisible()
    expect(posted).toHaveLength(0)
    await field.press('Enter')
    await expect(field).toHaveValue('')
    expect(posted).toHaveLength(1)
    expect(posted[0].attachments[0]).toMatchObject({url:'/jiedan/media/fixture.png',type:'image'})
    await page.reload()
    await expect(field).toHaveValue('')
    await expect(thumb).toHaveCount(0)
  })
}

test('报价发送未确认，刷新后保留草稿并使用同一条消息重试',async({page})=>{
  await start(page)
  const quote={id:13,title:'交付测试报价',creatorId:1,employeeId:2,status:'pending',version:1,conversationVersion:0}
  const attempts=[]
  await page.route('**/jiedan/quote/**',r=>{
    const path=new URL(r.request().url()).pathname
    if(path.endsWith('/conversation') && r.request().method()==='POST'){
      attempts.push(r.request().postDataJSON())
      if(attempts.length===1)return r.fulfill({json:{code:500,msg:'请重试'}})
      return ok(r,{id:7})
    }
    return ok(r,path.endsWith('/list')?[quote]:path.endsWith('/conversation')?{items:[],hasMore:false}:quote)
  })
  await page.goto('/#/quotes?id=13&tab=chat')
  const field=page.getByRole('textbox',{name:'回复内容'})
  await field.fill('方案请补充排期')
  await field.press('Enter')
  await expect(page.getByText('请重试',{exact:true})).toBeVisible()
  await page.reload()
  await expect(field).toHaveValue('方案请补充排期')
  await field.press('Enter')
  await expect(field).toHaveValue('')
  expect(attempts).toHaveLength(2)
  expect(attempts[1].clientKey).toBe(attempts[0].clientKey)
  await page.reload()
  await expect(field).toHaveValue('')
})

test('退出登录清空标签页里的会话草稿，重新登录也不会恢复', async({page})=>{
  await start(page,'/#/order?id=1&tab=chat')
  const field=page.getByRole('textbox',{name:'回复客户'})
  await field.fill('退出后须清除')
  await page.goto('/#/mine')
  await expect(page.getByRole('button',{name:'退出登录'})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'退出登录'}).click()
  await expect(page).toHaveURL(/#\/login/)
  await page.getByPlaceholder('请输入登录账号').fill('boss')
  await page.getByPlaceholder('请输入密码',{exact:true}).fill('fixture-pass')
  await page.getByRole('button',{name:'登录',exact:true}).click()
  await expect(page).toHaveURL(/#\/workbench/)
  await page.goto('/#/order?id=1&tab=chat')
  await expect(field).toHaveValue('')
})

test('同一标签页在另一个登录会话打开时，清除原会话的草稿', async({page})=>{
  await start(page,'/#/order?id=1&tab=chat')
  const field=page.getByRole('textbox',{name:'回复客户'})
  await field.fill('仅原登录账号可见')
  await page.evaluate(()=>localStorage.setItem('token','fixture-second-session'))
  await page.reload()
  await expect(field).toHaveValue('')
  await page.evaluate(()=>localStorage.setItem('token','fixture-boss'))
  await page.reload()
  await expect(field).toHaveValue('')
})

test('浏览器拒绝标签页存储时仍可打开项目和收发回复',async({page})=>{
  await fixture(page)
  await page.addInitScript(()=>{
    localStorage.setItem('token','fixture-boss')
    Object.defineProperty(window,'sessionStorage',{get(){throw new Error('storage blocked')}})
  })
  await page.route('**/jiedan/order/progress',r=>ok(r,order))
  await page.goto('/#/order?id=1&tab=chat')
  const field=page.getByRole('textbox',{name:'回复客户'})
  await field.fill('仍然可以发送')
  await field.press('Enter')
  await expect(field).toHaveValue('')
})

test('另一标签页退出后，打开的旧回复会立即清空并停止发送',async({page,context})=>{
  await start(page,'/#/order?id=1&tab=chat')
  const field=page.getByRole('textbox',{name:'回复客户'})
  await field.fill('不会留在另一标签页里')
  const other=await context.newPage()
  await fixture(other)
  await other.goto('/#/mine')
  await other.getByRole('button',{name:'退出登录'}).click()
  await expect(other).toHaveURL(/#\/login/)
  await expect(field).toHaveValue('')
  let posts=0
  await page.route('**/jiedan/order/progress',r=>{posts++;return ok(r,order)})
  await field.fill('旧页面发送检查')
  await field.press('Enter')
  await expect(page.getByText('登录账号已变更，请刷新页面后再发送')).toBeVisible()
  expect(posts).toBe(0)
})
