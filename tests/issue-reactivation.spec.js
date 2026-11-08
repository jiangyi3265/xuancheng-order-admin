const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')

async function openProjectIssues(page, issueStates) {
  await fixture(page, 'employee')
  await page.addInitScript(() => localStorage.setItem('token', 'fixture-employee'))

  const bugs = issueStates.map(([id, status]) => ({
    ...order.bugs[0], id, status, content: '问题 ' + id
  }))
  const project = {...order, version:10, bugs, unread:[]}
  const writes = []
  const ok = (r, data) => r.fulfill({json:{code:200, data}})
  function updateCount() {
    project.actionBugCount = bugs.filter(b => b.status === 'action').length
  }
  function updateIssue(id, status) {
    bugs.find(b => b.id === id).status = status
    project.version++
    updateCount()
  }
  updateCount()
  await page.route('**/jiedan/order/list', r => {
    const {bugs, timeline, ...summary} = project
    return ok(r, [summary])
  })
  await page.route('**/jiedan/order/1', r => ok(r, project))
  await page.route('**/jiedan/order/1/version', r => ok(r, {version:project.version}))
  await page.route('**/jiedan/order/read', r => ok(r, {id:1, version:project.version}))
  await page.route(/\/jiedan\/order\/bug\/(\d+)\/status$/, r => {
    const id = Number(r.request().url().match(/bug\/(\d+)/)[1])
    const {status} = r.request().postDataJSON()
    writes.push({id, status})
    updateIssue(id, status)
    return ok(r, project)
  })
  await page.goto('/#/order?id=1&tab=bugs')
  const panel = page.locator('.bug-panel')
  await expect(panel.locator('.bug-item')).toHaveCount(bugs.length)
  return {panel, writes, updateIssue}
}

test('已解决问题重新激活后可进入只有一条的队列，未交办的记录留在清单', async ({page}) => {
  const {panel, writes} = await openProjectIssues(page, [[1,'open'], [2,'resolved']])
  const resolved = panel.locator('[data-notice-id="2"]')
  await expect(resolved.locator('.bug-disclosure')).toHaveAttribute('aria-expanded', 'false')
  await resolved.getByRole('button', {name:'重新激活', exact:true}).click({timeout:2500})
  const start = panel.getByRole('button', {name:/^逐条处理（/})
  await expect(start).toContainText('1')
  await start.click()
  await expect(panel.getByRole('status')).toContainText('剩余 1 条')
  await expect(panel.locator('.bug-item')).toHaveCount(1)
  await expect(resolved).toBeVisible()
  await panel.getByRole('button', {name:'解决最后一条'}).click()
  await expect(panel.getByRole('status')).toContainText('没有需处理')
  await panel.getByRole('button', {name:'返回全部问题'}).click()
  await expect(panel.locator('[data-notice-id="1"]')).toContainText('未标记')
  await expect(resolved.locator('.bug-disclosure')).toHaveAttribute('aria-expanded', 'true')
  await expect(resolved.getByRole('button', {name:'重新激活', exact:true})).toBeVisible()
  expect(writes).toEqual([{id:2,status:'action'}, {id:2,status:'resolved'}])

  const record = panel.locator('[data-notice-id="1"]')
  await record.getByRole('button', {name:'加入逐条处理', exact:true}).click()
  await start.click()
  await expect(record).toBeVisible()
  await expect(resolved).not.toBeVisible()
  expect(writes.at(-1)).toEqual({id:1,status:'action'})
})

test('处理过程中同事重新激活的问题加入队列，继续处理时不跳到普通记录', async ({page}) => {
  const {panel, writes, updateIssue} = await openProjectIssues(page, [[3,'open'], [4,'action'], [5,'resolved']])
  await panel.getByRole('button', {name:/^逐条处理（/}).click({timeout:2500})
  await expect(panel.locator('[data-notice-id="4"]')).toBeVisible()
  updateIssue(5, 'action')
  await page.evaluate(() => dispatchEvent(new Event('focus')))
  await expect(panel.getByRole('status')).toContainText('剩余 2 条')
  await expect(panel.locator('[data-notice-id="4"]')).toBeVisible()
  await panel.getByRole('button', {name:'解决并继续'}).click()
  await expect(panel.locator('.bug-item')).toHaveCount(1)
  await expect(panel.locator('[data-notice-id="5"]')).toBeVisible()
  await expect(panel.getByRole('status')).toContainText('剩余 1 条')
  expect(writes).toEqual([{id:4,status:'resolved'}])
})

test('客户重新激活已解决问题时发送明确的重开操作，失败保留原状态可重试', async ({page}) => {
  await fixture(page, 'customer')
  await page.addInitScript(() => localStorage.setItem('customerToken','fixture-customer'))
  const bug = {...order.bugs[0], id:15, status:'resolved'}
  const project = {...order, bugs:[bug]}
  const writes = []
  await page.route('**/jiedan/portal/orders/1', r => r.fulfill({json:{code:200, data:project}}))
  await page.route('**/jiedan/portal/bug/15/status', r => {
    writes.push(r.request().postDataJSON())
    if (writes.length === 1) return r.fulfill({json:{code:503,msg:'暂时无法处理'}})
    bug.status = 'open'
    return r.fulfill({json:{code:200, data:project}})
  })
  await page.goto('/#/projects/1')
  await page.getByRole('button', {name:'问题',exact:true}).click()
  await page.getByRole('button', {name:'展开',exact:true}).click()
  const card = page.locator('.bug-item').filter({hasText:bug.content})
  const reopen = card.getByText('重新激活', {exact:true})
  await reopen.click()
  await expect(page.getByText('暂时无法处理')).toBeVisible()
  await expect(card.getByRole('radio', {name:'已解决'})).toBeChecked()
  await reopen.click()
  await expect(card.getByRole('radio', {name:'未解决'})).toBeChecked()
  expect(writes).toEqual([{status:'reopen'}, {status:'reopen'}])
})
