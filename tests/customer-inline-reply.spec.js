const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const ok = (route, data) => route.fulfill({json:{code:200,data}})
function issue(id,status='open') {
  return {id,status,progressStatus:status,content:'需求 '+id,time:'2026-11-08 10:00',attachments:[],updates:[]}
}
async function setup(page, bugs) {
  await fixture(page,'customer')
  await page.addInitScript(()=>{localStorage.setItem('customerToken','fixture-customer');localStorage.setItem('customerAccount','fixture')})
  const project={...order,status:'doing',bugs,version:1}
  await page.route('**/jiedan/portal/orders/1',r=>ok(r,project))
  await page.route('**/jiedan/portal/orders/1/version',r=>ok(r,{version:project.version}))
  return project
}
const path = id => '/#/projects/1?tab=bugs&issue='+id

test('客户在新浏览器打开复制的需求链接，登录后仍进入原需求', async ({page}) => {
  await fixture(page, 'customer')
  const bug = issue(17)
  await page.route('**/jiedan/portal/orders/1', route => ok(route, {...order, bugs:[bug]}))
  await page.goto('/client/#/projects/1?tab=bugs&issue=17')
  await page.getByPlaceholder('请输入登录账号').fill('fixture-customer')
  await page.getByPlaceholder('请输入密码', {exact:true}).fill('fixture-password')
  await page.getByRole('button', {name:'登录', exact:true}).click()
  await expect(page.locator('#requirement-17')).toContainText(bug.content)
  await expect(page.locator('.issue-composer')).toBeVisible()
  await expect(page).toHaveURL(/issue=17$/)
})

for(const width of [390,1440]) {
  test('客户在单条需求补图、重试与原子重新打开 '+width, async({page})=>{
    await page.setViewportSize({width,height:750})
    const bug=issue(11,'resolved'), other=issue(12)
    const project=await setup(page,[bug,other])
    let upload
    await page.route('**/jiedan/media/upload',r=>{upload=r})
    const requests=[]
    await page.route('**/jiedan/portal/bug/11/update',r=>{
      const payload=r.request().postDataJSON()
      requests.push(payload)
      if (requests.length===1) return r.fulfill({json:{code:500,msg:'暂未确认发送结果'}})
      bug.updates.push({id:18,createdBy:'客户',senderKind:'customer',content:payload.content,attachments:payload.attachments})
      bug.progressStatus='action'
      bug.status='open'
      project.version++
      return ok(r,project)
    })
    await page.goto(path(11))
    const composer=page.locator('.issue-composer')
    const send=composer.getByRole('button',{name:'发送',exact:true})
    await expect(composer.getByRole('textbox',{name:'补充这条需求'})).toBeInViewport()
    await page.getByRole('button',{name:'还要调整'}).click()
    await expect(composer).toContainText('发送说明后将重新打开这条需求')
    const textarea=composer.getByRole('textbox')
    await textarea.fill('请调整箭头指向的位置')
    await composer.locator('input[multiple]').first().setInputFiles({name:'补充.png',mimeType:'image/png',buffer:Buffer.from('p')})
    await expect.poll(()=>!!upload).toBe(true)
    await expect(send).toBeDisabled()
    await ok(upload,{url:'/app-icon-192.png',type:'image',ext:'png'})
    await expect(send).toBeEnabled()
    // Candidate confirmation and Shift+Enter cannot submit the draft.
    await textarea.dispatchEvent('keydown',{key:'Enter',isComposing:true})
    await textarea.press('Shift+Enter')
    expect(requests).toHaveLength(0)
    await send.click()
    await expect(page.getByText('暂未确认发送结果')).toBeVisible()
    await page.reload()
    await expect(textarea).toHaveValue(/请调整箭头指向的位置/)
    await expect(composer.locator('.media-thumb')).toHaveCount(1)
    await expect(composer).toContainText('发送说明后将重新打开这条需求')
    await textarea.press('Enter')
    await expect.poll(()=>requests.length).toBe(2)
    expect(requests[0].reopen).toBe(true)
    expect(requests[1]).toEqual(requests[0])
    expect(requests[1].requestKey).toBeTruthy()
    await expect(page.locator('#requirement-11 .bug-updates')).toContainText('请调整箭头指向的位置')
    await expect(textarea).toHaveValue('')
    await expect(page).toHaveURL(/issue=11/)
    await expect(page.getByRole('button',{name:'确认已解决'})).toBeVisible()
  })
}

test('单条草稿切换互不串单，更多菜单复制精确链接',async({page})=>{
  await setup(page,[issue(11),issue(12)])
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
    writeText:async text=>{ window.copied=text }
  }}))
  await page.goto(path(11))
  const field=page.locator('.issue-composer textarea')
  await field.fill('第一条的草稿')
  await page.evaluate(()=>{location.hash='/projects/1?tab=bugs&issue=12&update=102'})
  await expect(field).toHaveValue('')
  await field.fill('第二条的草稿')
  await page.evaluate(()=>history.back())
  await expect(field).toHaveValue('第一条的草稿')
  await page.getByRole('button',{name:'更多操作'}).click()
  await page.getByRole('menuitem',{name:'复制需求链接'}).click()
  await expect.poll(()=>page.evaluate(()=>window.copied)).toBe(await page.evaluate(()=>location.origin+'/client/#/projects/1?tab=bugs&issue=11'))
  await expect(page.getByText('需求链接已复制')).toBeVisible()
})

test('清单不记读，通知定位具体回复，只提交在屏幕内的本条团队回复',async({page})=>{
  await page.setViewportSize({width:390,height:680})
  const bug=issue(11), other=issue(12)
  bug.updates=Array.from({length:15},(_,i)=>({
    id:100+i,content:'补充记录 '+i+'\n'+('内容\n'.repeat(16)),createdBy:'成员',
    senderKind:i===4 || i===12 ? 'team' : 'customer'
  }))
  other.updates=[{id:200,senderKind:'team',content:'另一个需求的新回复'}]
  await setup(page,[bug,other])
  const reads=[]
  await page.route('**/jiedan/portal/orders/1/issues/*/replies/*/read',r=>{
    reads.push(r.request().url().match(/issues\/(\d+)\/replies\/(\d+)/).slice(1));return ok(r,{})
  })
  await page.goto('/#/projects/1?tab=bugs')
  await expect(page.locator('#requirement-12')).toContainText('另一个需求的新回复')
  await page.waitForTimeout(400)
  expect(reads).toEqual([])
  await page.evaluate(()=>{location.hash='/projects/1?tab=bugs&issue=11&update=104'})
  const target=page.locator('#issue-reply-104')
  await expect(target).toBeInViewport()
  await expect(target).toHaveClass(/target-reply/)
  await expect.poll(()=>reads).toEqual([['11','104']])
  await page.locator('#issue-reply-112').scrollIntoViewIfNeeded()
  await expect.poll(()=>reads).toEqual([['11','104'],['11','112']])
  await page.evaluate(()=>{location.hash='/projects/1?tab=bugs&issue=12&update=200'})
  await expect(page.locator('#issue-reply-200')).toBeInViewport()
  await expect.poll(()=>reads.at(-1)).toEqual(['12','200'])
})
