const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

const ok = (route, data) => route.fulfill({json:{code:200, data}})
const markedAt = '2026-11-08 13:42:19'
const clearedAt = '2026-11-08 15:07:48'

async function attachBoard(page, role, rows) {
  const errors = await fixture(page, role)
  await page.addInitScript(role => {
    localStorage.setItem('token', 'fixture-' + role)
    localStorage.setItem('xc.orderView', 'kanban')
  }, role)
  await page.route('**/jiedan/order/list', route => ok(route, rows.map(row => {
    const {timeline, bugs, ...summary} = row
    return summary
  })))
  await page.route(/\/jiedan\/order\/\d+$/, route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop())
    return ok(route, rows.find(row => row.id === id))
  })
  await page.route('**/jiedan/order/1/version', route => ok(route, {version:rows[0].version}))
  await page.route('**/jiedan/order/read', route => ok(route, {id:1,version:rows[0].version}))
  return errors
}

async function openGroup(page) {
  await page.getByRole('button', {name:'展开进行中',exact:true}).click()
  return page.getByRole('dialog', {name:'全屏看板'})
}

test('全屏卡片处理标记失败可重试，两人可看到同一状态和标记时间，问题待办仍单独处理', async ({page, browser, baseURL}) => {
  await page.setViewportSize({width:1366,height:760})
  const project = {...order, unread:[], version:12, actionBugCount:1,
    bugs:[{...order.bugs[0],id:7,status:'action',content:'请检查图片清晰度'}]}
  const writes = []
  const errors = await attachBoard(page,'employee',[project])
  let firstAttempt
  const mark = async route => {
    const req = route.request()
    const body = req.postDataJSON()
    writes.push({method:req.method(), ...body})
    if (writes.length === 1) {firstAttempt = route; return}
    Object.assign(project, {handled:body.handled,handledTime:body.handled ? markedAt : clearedAt,version:project.version + 1})
    await ok(route,project)
  }
  await page.route('**/jiedan/order/1/handling', mark)
  await page.goto('/#/order')
  const group = await openGroup(page)
  const card = group.locator('.focus-card').filter({hasText:project.title})
  const state = card.getByText('未处理',{exact:true})
  const action = card.getByRole('button',{name:'完成',exact:true})
  const issue = card.getByRole('button',{name:'处理问题（1）',exact:true})
  await expect(state).toBeVisible()
  await expect(card.locator('small')).toHaveText('创建于 ' + project.createTime.slice(0,16))
  await action.click()
  await expect.poll(() => Boolean(firstAttempt)).toBe(true)
  await expect(card.getByRole('button',{name:'保存中…'})).toBeDisabled()
  await expect(state).toBeVisible()
  await firstAttempt.fulfill({json:{code:503,msg:'处理标记暂时无法保存'}})
  await expect(page.getByText('处理标记暂时无法保存')).toBeVisible()
  await expect(state).toBeVisible()
  await expect(card.locator('time')).toHaveText(project.createTime.slice(0,16))
  await action.click()
  await expect(card.getByText('已处理',{exact:true})).toBeVisible()
  await expect(card.locator('small')).toHaveText('标记于 ' + markedAt.slice(0,16))
  await expect(issue).toBeVisible()

  await page.reload()
  await openGroup(page)
  await expect(card.getByText('已处理',{exact:true})).toBeVisible()
  await expect(card.locator('time')).toHaveText(markedAt.slice(0,16))
  await issue.click()
  await expect(page.locator('.bug-panel .notice-target')).toContainText('请检查图片清晰度')
  await expect(page.locator('.bug-panel .notice-target .bug-status .is-active')).toHaveText('需处理')

  const boss = await browser.newContext({baseURL, viewport:{width:390,height:740}, serviceWorkers:'block'})
  try {
    const otherPage = await boss.newPage()
    const otherErrors = await attachBoard(otherPage,'boss',[project])
    await otherPage.route('**/jiedan/order/1/handling', mark)
    await otherPage.goto('/#/order')
    const otherGroup = await openGroup(otherPage)
    const otherCard = otherGroup.locator('.focus-card').filter({hasText:project.title})
    await expect(otherCard.getByText('已处理',{exact:true})).toBeVisible()
    await otherCard.getByRole('button',{name:'改为未处理',exact:true}).click()
    await expect(otherCard.getByText('未处理',{exact:true})).toBeVisible()
    await expect(otherCard.locator('small')).toHaveText('标记于 ' + clearedAt.slice(0,16))
    await expect(otherCard.getByRole('button',{name:'处理问题（1）'})).toBeVisible()
    expect(otherErrors).toEqual([])
  } finally {await boss.close()}
  expect(writes).toEqual([
    {method:'PUT',handled:true,version:12}, {method:'PUT',handled:true,version:12},
    {method:'PUT',handled:false,version:13}
  ])
  expect(errors).toEqual([])
})

test('普通协作者只能标记自己负责的项目', async ({page}) => {
  const own = {...order,id:1,title:'本人的项目',ownerId:2}
  const other = {...order,id:2,title:'他人的项目',ownerId:1,handled:true,handledTime:markedAt}
  await attachBoard(page,'employee',[own,other])
  await page.goto('/#/order')
  const group = await openGroup(page)
  const ownCard = group.locator('.focus-card').filter({hasText:own.title})
  const otherCard = group.locator('.focus-card').filter({hasText:other.title})
  await expect(ownCard.getByRole('button',{name:'完成',exact:true})).toBeEnabled()
  await expect(otherCard.getByRole('button',{name:/完成|改为未处理/})).toHaveCount(0)
})
