const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

for (const [width, mode] of [[1440,'list'], [375,'list'], [1440,'kanban'], [375,'kanban']]) {
  test('客户在等分组、卡片和筛选记忆 '+width+' '+mode, async ({page}) => {
    await fixture(page)
    await page.setViewportSize({width, height: width === 375 ? 640 : 900})
    await page.addInitScript(mode => {
      localStorage.setItem('token','fixture-boss')
      localStorage.setItem('xc.orderView',mode)
    },mode)
    const customerMessage = {type:'message',time:new Date().toISOString().slice(0,10),content:'麻烦确认'}
    const current = {...order,openBugCount:3,newBugCount:1,lastMessage:customerMessage}
    const stale = {...order,id:2,title:'过期消息项目',newBugCount:0,openBugCount:2,lastMessage:{...customerMessage,time:'2020-01-01'}}
    await page.route('**/jiedan/order/list',r=>r.fulfill({json:{code:200,data:[current,stale]}}))
    await page.goto('/#/order')
    const chip = page.locator('.qchip').filter({hasText:'客户在等'})
    await expect(chip.locator('b')).toHaveText('1')
    await expect(page.locator('.customer-wait-badges').getByText('客户等回复',{exact:true})).toBeVisible()
    await expect(page.locator('.customer-wait-badges').getByText('3 条问题（1 条新的）',{exact:true})).toBeVisible()
    await expect(page.locator('.customer-wait-badges').getByText('2 条问题未解决',{exact:true})).toBeVisible()
    await chip.click()
    await expect(page.getByRole('button',{name:'此分组暂不支持导出'})).toBeDisabled()
    await expect(page.locator('.customer-wait-badges').getByText('2 条问题未解决',{exact:true})).toHaveCount(0)
    await expect(page).toHaveURL(/status=waiting/)
    await page.goto('/#/workbench')
    await expect(page.getByText('需要我处理',{exact:true}).first()).toBeVisible()
    await page.goto('/#/order')
    await expect(chip).toHaveClass(/on/)
    current.lastMessage={...customerMessage,type:'reply'}
    await page.reload()
    await expect(page.locator('.customer-wait-badges').getByText('客户等回复',{exact:true})).toHaveCount(0)
    await expect(page.locator('.customer-wait-badges').getByText('3 条问题（1 条新的）',{exact:true})).toBeVisible()
    await page.locator('.qchip').filter({hasText:'全部'}).click()
    await expect(page.locator('.customer-wait-badges').getByText('2 条问题未解决',{exact:true})).toBeVisible()
  })
}

for (const role of ['boss','employee']) {
  test('查看待处理问题后返回项目 '+role, async ({page}) => {
    await fixture(page,role)
    await page.addInitScript(role => localStorage.setItem('token','fixture-'+role),role)
    const isBoss = role==='boss'
    const status = isBoss?'review':'doing'
    const name = isBoss?'验收通过':'提交验收'
    const project={...order,status,unread:[]}
    await page.route('**/jiedan/order/1',r=>r.fulfill({json:{code:200,data:project}}))
    await page.route('**/jiedan/order/list',r=>r.fulfill({json:{code:200,data:[project]}}))
    await page.route('**/jiedan/order/read',r=>r.fulfill({json:{code:200,data:project}}))
    await page.goto('/#/order?id=1')
    await page.getByRole('button',{name,exact:true}).first().click()
    const dialog=page.getByRole('dialog',{name:isBoss?'项目验收':'提交验收',exact:true})
    await expect(dialog).toContainText('还有 1 条问题没处理')
    await expect(dialog.getByRole('button',{name:'仍然'+name,exact:true})).toBeVisible()
    await dialog.getByRole('button',{name:'去看看'}).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/tab=bugs/)
    await expect(page.locator('.bug-item').filter({hasText:'移动端图片显示不全'})).toBeVisible()
  })
}

test('所有问题解决后沿用提交验收按钮', async ({page}) => {
  await fixture(page,'employee')
  await page.addInitScript(() => localStorage.setItem('token','fixture-employee'))
  const project={...order, bugs:order.bugs.map(b=>({...b,status:'resolved'})), unread:[]}
  await page.route('**/jiedan/order/1',r=>r.fulfill({json:{code:200,data:project}}))
  await page.route('**/jiedan/order/list',r=>r.fulfill({json:{code:200,data:[project]}}))
  await page.goto('/#/order?id=1')
  await page.getByRole('button',{name:'提交验收',exact:true}).first().click()
  const dialog=page.getByRole('dialog',{name:'提交验收'})
  await expect(dialog.getByRole('button',{name:'提交验收',exact:true})).toBeVisible()
  await expect(dialog.getByRole('button',{name:'去看看'})).toHaveCount(0)
})
