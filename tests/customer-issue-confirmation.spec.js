const {test,expect} = require('@playwright/test')
const {fixture,order} = require('./fixtures.cjs')
const {editor,draw} = require('./annotation-fixture.cjs')
const ok = (route,data) => route.fulfill({json:{code:200,data}})
const bugId = 22
const roundId = 74
const routeTo = review => '/#/projects/1?tab=bugs&issue='+bugId+(review?'&review='+review:'')
async function setup(page, review={}) {
  await fixture(page,'customer')
  await page.addInitScript(()=>{
    localStorage.setItem('customerToken','fixture-customer')
    localStorage.setItem('customerAccount','client')
    window.issueDecisions=[]
    window.addEventListener('customer-issue-reviewed', e=>window.issueDecisions.push(e.detail))
  })
  const beforeImage={type:'image',name:'旧版.png',url:'/app-icon-192.png',annotated:true}
  const afterImage={type:'image',name:'新版.png',url:'/app-icon-512.png'}
  const bug={
    id:bugId,status:'confirm',progressStatus:'confirm',content:'修改按钮',
    time:'2026-11-08 12:00',attachments:[beforeImage],updates:[],
    review:{id:roundId,state:'pending',beforeImage,afterImage,time:'2026-11-09 10:30',content:'到店按钮已经换好',...review}
  }
  bug.updates.push({id:roundId,senderKind:'team',content:bug.review.content,attachments:bug.review.afterImage?[bug.review.afterImage]:[],time:bug.review.time})
  const project={...order, id:1, version:1,bugs:[bug]}
  const decisions=[]
  await page.route('**/jiedan/portal/orders/1',r=>ok(r,project))
  await page.route('**/jiedan/portal/orders/1/version',r=>ok(r,{version:project.version}))
  await page.route('**/jiedan/portal/bug/22/review/*',r=>{
    const payload=r.request().postDataJSON()
    decisions.push(payload)
    bug.review.state=payload.decision==='accept'?'accepted':'adjustment'
    bug.status=bug.progressStatus=payload.decision==='accept'?'resolved':'action'
    project.version++
    return ok(r,project)
  })
  return {bug,project,decisions}
}

for (const width of [390,1440]) {
  test('需求改前改后对照，普通回复保持待确认，客户亲自确认后完成 '+width, async ({page})=>{
    await page.setViewportSize({width,height:800})
    const {bug,project,decisions}=await setup(page)
    let replies=0
    await page.route('**/jiedan/portal/bug/22/update',r=>{
      bug.updates.push({id:83,senderKind:'customer',content:r.request().postDataJSON().content,attachments:[]})
      replies++
      project.version++
      return ok(r,project)
    })
    await page.goto(routeTo())
    await expect(page).toHaveURL(/review=74/)
    const review=page.getByRole('region',{name:'本次修改'})
    await expect(review.getByRole('button',{name:'放大改后截图'})).toBeVisible()
    if (width<700) {
      await expect(review.getByRole('button',{name:'放大改前截图'})).toBeHidden()
      await review.getByRole('button',{name:'改前',exact:true}).click()
    }
    await review.getByRole('button',{name:'放大改前截图'}).click()
    const preview=page.getByRole('dialog',{name:'旧版.png'})
    await expect(preview.locator('img')).toHaveAttribute('src','/app-icon-192.png')
    await preview.getByRole('button',{name:'下一张图片'}).click()
    await page.getByRole('dialog',{name:'新版.png'}).getByRole('button',{name:'关闭图片预览'}).click()
    await page.getByRole('button',{name:'更多操作'}).click()
    await page.getByRole('menuitem',{name:'补充说明'}).click()
    await page.getByRole('textbox',{name:'补充这条需求'}).fill('先补充一条信息')
    await page.getByRole('button',{name:'发送',exact:true}).click()
    await expect.poll(()=>replies).toBe(1)
    await expect(review.getByRole('button',{name:'确认好了'})).toBeEnabled()
    expect(decisions).toHaveLength(0)
    await review.getByRole('button',{name:'确认好了'}).click()
    await expect(page.locator('.requirement-status')).toHaveText('已解决')
    await expect(review.getByRole('button',{name:'确认好了'})).toHaveCount(0)
    expect(decisions).toEqual([{decision:'accept',content:'',attachments:[]}])
    await expect.poll(()=>page.evaluate(()=>window.issueDecisions.at(-1))).toMatchObject({issueId:22,reviewId:74,status:'resolved',account:'client'})
  })
}

test('还要调整可以圈注改后图，失败重试保留草稿和原图',async({page})=>{
  const {bug,decisions}=await setup(page)
  await page.route('**/jiedan/media/upload',r=>ok(r,{url:'/app-icon-192.png',size:1100,type:'image'}))
  let first=true
  await page.route('**/jiedan/portal/bug/22/review/74',r=>{
    if (first) { first=false;return r.fulfill({json:{code:500,msg:'请再试一次'}}) }
    return r.fallback()
  })
  await page.goto(routeTo(roundId))
  const review=page.getByRole('region',{name:'本次修改'})
  await review.getByRole('button',{name:'还要调整'}).click()
  const composer=page.locator('.issue-composer')
  await composer.getByRole('button',{name:'圈注改后图'}).click()
  await draw(page,'箭头')
  await editor(page).getByRole('button',{name:'保存圈注'}).click()
  await expect(editor(page)).toHaveCount(0)
  await composer.getByRole('button',{name:'提交调整'}).click()
  await expect(page.getByText('请再试一次',{exact:true})).toBeVisible()
  await expect(composer.locator('.media-thumb')).toHaveCount(1)
  await expect(review.getByRole('button',{name:'放大改后截图'}).locator('img')).toHaveAttribute('src','/app-icon-512.png')
  await composer.getByRole('button',{name:'提交调整'}).click()
  await expect.poll(()=>decisions.length).toBe(1)
  expect(decisions[0]).toMatchObject({decision:'adjust',attachments:[{annotated:true,url:'/app-icon-192.png'}]})
  expect(bug.review.afterImage.url).toBe('/app-icon-512.png')
  await expect(page.locator('.requirement-status')).toHaveText('等团队处理')
})

test('旧回合链接不决定新回合，只有文字也能确认',async({page})=>{
  const {decisions}=await setup(page,{beforeImage:null,afterImage:null,content:'检索速度已调整'})
  let read=0
  await page.route('**/jiedan/portal/orders/1/issues/22/replies/74/read',r=>{read++;return ok(r,{})})
  await page.goto(routeTo(73))
  await expect(page.getByRole('button',{name:'查看最新需求'})).toBeVisible()
  await expect(page.getByRole('button',{name:'确认好了'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'确认已解决'})).toHaveCount(0)
  await expect(page.getByText('检索速度已调整')).toHaveCount(0)
  expect(read).toBe(0)
  await page.getByRole('button',{name:'查看最新需求'}).click()
  const review=page.getByRole('region',{name:'本次修改'})
  await expect(review).toContainText('检索速度已调整')
  await expect(review.locator('img')).toHaveCount(0)
  await expect(page).toHaveURL(/review=74/)
  await expect.poll(()=>read).toBe(1)
  await review.getByRole('button',{name:'确认好了'}).click()
  await expect.poll(()=>decisions.length).toBe(1)
})
