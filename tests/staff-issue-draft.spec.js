const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const issueUrl = id => '/#/order?id=' + id + '&tab=bugs'
const ok = (route, data) => route.fulfill({json: {code: 200, data}})
const form = page => page.locator('.bug-form')
const field = page => form(page).getByRole('textbox')
async function start(page, role = 'boss') {
  await fixture(page, role)
  await page.addInitScript(role => localStorage.setItem('token', 'fixture-' + role), role)
  await page.route('**/jiedan/order/2', route => ok(route, {...order, id: 2, title: '第二个项目'}))
  await page.goto(issueUrl(1))
}
async function compose(page) {
  await page.getByRole('button', {name: '记一条问题', exact: true}).click()
}

test('问题文字和上传好的附件跟随账号和项目，关页重开后还能续写', async ({page, context}) => {
  await start(page)
  await compose(page)
  await page.route('**/jiedan/media/upload', route => ok(route, {url: '/jiedan/media/issue.png', ext:'png'}))
  await field(page).fill('首页按钮改成确认到店')
  await form(page).locator('input[type=file]').last().setInputFiles({name:'标注.png', mimeType:'image/png', buffer:Buffer.from('png')})
  await expect(form(page).locator('.media-thumb')).toHaveCount(1)
  await page.goto(issueUrl(2))
  await compose(page)
  await expect(field(page)).toHaveValue('')
  await field(page).fill('另一个项目')
  await page.goto(issueUrl(1))
  await expect(field(page)).toHaveValue('首页按钮改成确认到店')
  await page.close()
  const staff = await context.newPage()
  await start(staff, 'employee')
  await compose(staff)
  await expect(field(staff)).toHaveValue('')
  await expect(form(staff).locator('.media-thumb')).toHaveCount(0)
  await staff.close()
  const boss = await context.newPage()
  await start(boss)
  await expect(field(boss)).toHaveValue('首页按钮改成确认到店')
  await expect(form(boss).locator('.media-thumb')).toHaveCount(1)
})

for (const assign of [false, true]) {
  test((assign ? '指派' : '记录') + '失败保留问题草稿，成功才清掉本条', async ({page}) => {
    await start(page)
    await compose(page)
    await field(page).fill('核对点选的区域')
    const payloads = []
    await page.route('**/jiedan/order/bug', async route => {
      payloads.push(route.request().postDataJSON())
      if (payloads.length === 1) return route.fulfill({json:{code:500,msg:'提交失败'}})
      await ok(route, order)
    })
    const send = form(page).getByRole('button', {name: assign ? '发给小陈处理' : '记下问题', exact:true})
    await send.click()
    await expect(page.getByText('提交失败', {exact:true})).toBeVisible()
    await page.reload()
    await expect(field(page)).toHaveValue('核对点选的区域')
    await send.click()
    await expect(form(page)).toHaveCount(0)
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toMatchObject({orderId:1, content:'核对点选的区域', needsAction:assign})
    await page.reload()
    await compose(page)
    await expect(field(page)).toHaveValue('')
  })
}

test('刷新时未上传完的附件可以补选，防止漏发', async ({page}) => {
  await start(page)
  await compose(page)
  await field(page).fill('查看附图')
  const picture = {name:'附图.png', mimeType:'image/png', buffer:Buffer.from('picture')}
  let uploads = 0
  await page.route('**/jiedan/media/upload', route => {
    uploads++
    return uploads === 1 ? route.fulfill({json:{code:500,msg:'附件上传失败'}}) :
      ok(route, {url:'/jiedan/media/reselected.png',ext:'png'})
  })
  await form(page).locator('input[type=file]').setInputFiles(picture)
  await expect(form(page).getByRole('button',{name:'重试'})).toBeVisible()
  await expect(form(page).getByRole('button',{name:'记下问题',exact:true})).toBeDisabled()
  await page.reload()
  await expect(field(page)).toHaveValue('查看附图')
  await expect(form(page).getByRole('button',{name:'记下问题',exact:true})).toBeDisabled()
  await form(page).getByLabel('重新选择 附图.png').setInputFiles(picture)
  await expect(form(page).locator('.media-thumb')).toHaveCount(1)
  await expect(form(page).getByRole('button',{name:'记下问题',exact:true})).toBeEnabled()
})
