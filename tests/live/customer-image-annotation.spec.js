const {test, expect} = require('@playwright/test')
const {randomUUID} = require('node:crypto')
const {editor, screenshotFile, draw, expectMarkedImage} = require('../annotation-fixture.cjs')

test('客户在电脑和手机圈注需求与补充，管理员和负责人打开同一条能看到原位标记', async ({request,browser,baseURL,browserName}) => {
  const apiBase = process.env.E2E_BASE
  if (!apiBase || new URL(apiBase).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) {
    throw Error('此测试只能在本地临时数据库运行')
  }
  async function api(path, token, data) {
    const response = await request.fetch(apiBase+path,{method:data ? 'POST' : 'GET',data,
      headers:token ? {Authorization:'Bearer '+token} : {}})
    const result = await response.json()
    expect(result.code,result.msg).toBe(200)
    return result
  }
  const suffix = randomUUID().slice(0,8)
  const staff = 'annst'+suffix, customer = 'anncu'+suffix, pw='TestAnnotate123'
  const boss = (await api('/login',null,{username:'admin',password:'admin123'})).token
  await api('/jiedan/staff',boss,{userName:staff,nickName:'圈注负责人',password:pw})
  const members = (await api('/jiedan/staff/list',boss)).data
  const ownerId = members.find(user => user.userName===staff).id
  await api('/jiedan/customer',boss,{userName:customer,nickName:'圈注客户',ownerId,password:pw})
  const project = (await api('/jiedan/order',boss,{title:'截图反馈项目'+suffix,ownerId,customerAccount:customer,status:'doing'})).data
  expect(project.ownerId).toBe(ownerId)
  const contexts = []
  async function open(path,user,password,mobile) {
    const context = await browser.newContext({baseURL,viewport:{width:mobile ? 390 : 1440,height:840},hasTouch:mobile})
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(path)
    await page.getByPlaceholder('请输入登录账号').fill(user)
    await page.getByPlaceholder('请输入密码',{exact:true}).fill(password)
    await page.getByRole('button',{name:'登录',exact:true}).click()
    return page
  }
  async function markAndUpload(page, section, name, touch) {
    const input = section.locator('input[type=file][multiple]').first()
    await input.setInputFiles(await screenshotFile(page,name))
    await section.getByRole('button',{name:'圈注 '+name,exact:true}).click()
    await draw(page,'画圈',touch)
    await draw(page,'箭头',touch)
    const saved = page.waitForResponse(r => r.url().endsWith('/jiedan/media/upload') && r.request().method()==='POST')
    await editor(page).getByRole('button',{name:'保存圈注',exact:true}).click()
    const result = await (await saved).json()
    expect(result.code,result.msg).toBe(200)
    await expect(editor(page)).toBeHidden()
    return result.data.url
  }
  try {
    const desktop = await open('/client/#/intake',customer,pw,false)
    const intake = desktop.locator('form.request-panel')
    await expect(intake).toContainText(project.title)
    const initial = await markAndUpload(desktop,intake,'初次需求.png',false)
    const receipt = desktop.waitForResponse(r => r.url().endsWith('/jiedan/order/intake') && r.request().method()==='POST')
    await intake.getByRole('button',{name:'提交需求',exact:true}).click()
    const accepted = await (await receipt).json()
    expect(accepted.code,accepted.msg).toBe(200)
    expect(accepted.data.id).toBe(project.id)
    const issueId = accepted.data.bugId
    const phone = await open('/client/#/projects/'+project.id+'?tab=bugs&issue='+issueId,customer,pw,true)
    const composer = phone.locator('.issue-composer')
    const supplement = await markAndUpload(phone,composer,'补充截图.png',browserName==='chromium')
    const posted = phone.waitForResponse(r => r.url().endsWith('/jiedan/portal/bug/'+issueId+'/update') && r.request().method()==='POST')
    await composer.getByRole('button',{name:'发送',exact:true}).click()
    expect((await (await posted).json()).code).toBe(200)
    expect(initial).not.toBe(supplement)
    const detail = (await api('/jiedan/order/'+project.id,boss)).data
    const issue = detail.bugs.find(bug => bug.id === issueId)
    expect(issue.attachments).toMatchObject([{url:initial, annotated:true}])
    expect(issue.updates.at(-1).attachments).toMatchObject([{url:supplement, annotated:true}])
    const detailPath = '/#/order?id='+project.id+'&tab=bugs&bug='+issueId
    for (const [user,password,mobile] of [['admin','admin123',false],[staff,pw,true]]) {
      const page = await open(detailPath,user,password,mobile)
      const card = page.locator('.bug-item[data-notice-id="'+issueId+'"]')
      await expect(card).toBeVisible()
      // Opening the notification expands this card when the drawer transition finishes.
      await expect(card.locator('.bug-disclosure')).toHaveAttribute('aria-expanded','true')
      const thumbnails = card.locator('.bug-body .thumb-open')
      await expect(thumbnails).toHaveCount(2)
      for (const [index,url] of [initial,supplement].entries()) {
        await expect(thumbnails.nth(index).getByText('已圈注', {exact:true})).toBeVisible()
        await thumbnails.nth(index).click()
        const preview = page.locator('dialog.fullscreen-image')
        const image = preview.locator('img')
        await expect(image).toHaveAttribute('src',url)
        await expectMarkedImage(image)
        await preview.getByRole('button',{name:'关闭图片预览'}).click()
      }
    }
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
