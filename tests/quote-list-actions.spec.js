const { test, expect } = require('@playwright/test')
const { fixture } = require('./fixtures.cjs')

test('报价卡片可改名、取消删除并确认删除指定报价', async ({ page }) => {
  await fixture(page)
  let rows = [
    { id: 11, title: '官网设计', requirement:'旧需求', attachments:[], employeeId:2, status: 'quoted', version: 2, amount: 1800 },
    { id: 12, title: '小程序设计', status: 'pending', version: 1 }
  ]
  const writes = []
  await page.route('**/jiedan/quote/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data
    if (path.endsWith('/list')) data = rows
    else if (request.method() === 'PUT') {
      const change = request.postDataJSON()
      writes.push([path, change])
      data = rows[0] = { ...rows[0], title: change.title.trim(), requirement:change.requirement, version: 3 }
    } else if (request.method() === 'DELETE') {
      writes.push([path, request.postDataJSON()])
      rows = rows.filter(row => row.id !== 11)
    } else data = rows.find(row => path.endsWith('/' + row.id))
    await route.fulfill({ json: { code: 200, data } })
  })
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-boss'))
  await page.goto('/#/quotes')
  const card = page.locator('.quote-card').filter({ hasText: '官网' })
  const box = page.locator('.el-message-box:visible')
  await card.getByRole('button', { name: '编辑' }).click()
  const editor = page.getByRole('dialog', {name:'编辑报价单'})
  const title = editor.getByPlaceholder('例如：企业官网开发报价')
  await expect(title).toHaveValue('官网设计')
  await title.fill('  ')
  await editor.getByRole('button', { name:'保存',exact:true }).click()
  await expect(page.getByText('请填写报价标题')).toBeVisible()
  await title.fill('官网二期')
  await editor.locator('textarea').fill('新版需求与附件')
  await editor.getByRole('button', { name:'保存',exact:true }).click()
  await expect(card.getByRole('heading')).toHaveText('官网二期')
  await expect(card).toContainText('1,800.00')
  await expect(page).toHaveURL(/#\/quotes$/)
  await card.getByRole('button', { name: '删除', exact: true }).click()
  await expect(box).toContainText('确定删除「官网二期」')
  await box.getByRole('button', { name: '取消' }).click()
  await expect(card).toBeVisible()
  expect(writes).toEqual([['/jiedan/quote/11', { title:'官网二期', requirement:'新版需求与附件', attachments:[], employeeId:2, version:2, requestPrice:false }]])
  await card.getByRole('button', { name: '删除', exact: true }).click()
  await box.getByRole('button', { name: '确认删除' }).click()
  await expect(card).toHaveCount(0)
  expect(writes[1]).toEqual(['/jiedan/quote/11', { version: 3 }])
  await page.getByRole('heading', { name: '小程序设计' }).click()
  await expect(page.getByRole('dialog', { name: '报价详情' })).toBeVisible()
})

test('在工作台查看报价、清除红点并邀请对方按新需求报价', async ({page}) => {
  await fixture(page)
  await page.addInitScript(()=>localStorage.setItem('token','fixture-boss'))
  let q = {id:20,title:'商城',requirement:'支持购物车',employeeId:2,employeeName:'小陈',attachments:[],
    creatorId:1,status:'quoted',amount:260,version:2,noticeVersion:2,readVersion:0}
  const edits=[]
  await page.route('**/jiedan/quote/**',async r=>{
    const path=new URL(r.request().url()).pathname
    const data=r.request().postDataJSON()
    if(path.endsWith('/read')) {if(data[0].noticeVersion===q.noticeVersion)q.readVersion=q.noticeVersion}
    else if(r.request().method()==='PUT') {
      edits.push(data)
      q={...q,...data,status:'pending',version:3,noticeVersion:3}
    }
    await r.fulfill({json:{code:200,data:path.endsWith('/list')?[q]:q}})
  })
  await page.goto('/#/workbench')
  const panel=page.locator('.workbench-quotes')
  await expect(panel.getByText('1 条未读报价')).toBeVisible()
  await panel.getByRole('button',{name:'标为已读',exact:true}).click()
  await expect(panel.locator('.unread-dot')).toHaveCount(0)
  await page.reload()
  await expect(panel.getByRole('heading',{name:'商城'})).toBeVisible()
  await expect(panel.locator('.unread-dot')).toHaveCount(0)
  await panel.locator('.quote-open').click()
  await expect(page).toHaveURL(/#\/workbench$/)
  await page.getByRole('button',{name:'编辑报价单'}).click()
  const editor=page.getByRole('dialog',{name:'编辑报价单'})
  await editor.locator('textarea').fill('支持线上收款')
  await editor.getByRole('button',{name:'保存并邀请报价'}).click()
  await expect(page.getByRole('dialog',{name:'报价详情'})).toContainText('支持线上收款')
  expect(edits[0]).toMatchObject({requestPrice:true,employeeId:2,version:2})
})
