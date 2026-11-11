const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

async function inbox(page) {
  await fixture(page, 'customer')
  await page.addInitScript(() => {
    localStorage.setItem('customerToken', 'fixture-customer')
    localStorage.setItem('customerAccount', 'client')
  })
  const requirements = Array.from({length:36}, (_, i) => ({
    id:i + 1, title:'需求 ' + (i + 1), status:'open',
    latestTeamReply:{id:1000 + i, content:'回复内容 ' + i, time:'2026-11-09 09:00', unread:false}
  }))
  const bugs = requirements.map(item => ({
    id:item.id, content:item.title, status:'open',
    updates:[{...item.latestTeamReply, senderKind:'team'}]
  }))
  const ok = (route, data) => route.fulfill({json:{code:200, data}})
  await page.route('**/jiedan/portal/orders', r => ok(r, [{...order, requirements}]))
  await page.route('**/jiedan/portal/orders/1', r => ok(r, {...order, bugs}))
}

for (const [name, width, height, systemBack] of [
  ['手机按钮', 390, 844, false],
  ['电脑浏览器', 1280, 760, true]
]) {
  test(name + '返回消息后保留 URL、选中导航和阅读位置', async ({ page }) => {
    await page.setViewportSize({width, height})
    await inbox(page)
    await page.goto('/#/customer/messages?tab=messages')
    const link = page.getByRole('link').filter({has:page.getByText('需求 26',{exact:true})})
    await expect(link).toBeVisible()
    await expect(page.locator('.message-list .el-loading-mask')).toHaveCount(0)
    const top = await link.evaluate(el => {
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 160)
      return window.scrollY
    })
    expect(top).toBeGreaterThan(700)
    await link.click()
    await expect(page).toHaveURL(/issue=26&update=1025/)
    const goBack = page.locator('.topbar').getByRole('button',{name:'返回消息列表'})
    await expect(goBack).toBeVisible()
    if (systemBack) {
      await page.reload()
      await expect(goBack).toBeVisible()
      await page.goBack()
    } else {
      await goBack.click()
    }
    await expect(page).toHaveURL(/#\/customer\/messages\?tab=messages$/)
    await expect(page.getByRole('navigation',{name:'客户导航'}).getByRole('link',{name:'消息',exact:true})).toHaveAttribute('aria-current','page')
    await expect(link).toBeInViewport()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(top, 0)
  })
}

test('消息打开沟通后切到修改需求仍回消息，直接打开需求则回项目列表', async ({page}) => {
  await inbox(page)
  await page.goto('/#/customer/messages')
  await page.locator('.message-card').filter({has:page.getByText(order.title,{exact:true})}).click()
  await expect(page).toHaveURL(/tab=chat/)
  await page.getByRole('button',{name:'修改需求',exact:true}).click()
  await page.locator('.bug-item').first().getByRole('button',{name:'补充说明',exact:true}).click()
  await page.locator('.topbar').getByRole('button',{name:'返回消息列表'}).click()
  await expect(page).toHaveURL(/#\/customer\/messages$/)
  await page.goto('/#/projects/1?tab=bugs&issue=1')
  await page.locator('.topbar').getByRole('button',{name:'返回列表',exact:true}).click()
  await expect(page).toHaveURL(/#\/projects$/)
})
