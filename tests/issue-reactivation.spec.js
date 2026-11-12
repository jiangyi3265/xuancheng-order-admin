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
  await resolved.getByRole('button', {name:'重新打开', exact:true}).click({timeout:2500})
  const start = panel.getByRole('button', {name:/^逐条处理（/})
  await expect(start).toContainText('1')
  await start.click()
  await expect(panel.getByRole('status')).toContainText('剩余 1 条')
  await expect(panel.locator('.bug-item')).toHaveCount(1)
  await expect(resolved).toBeVisible()
  await panel.getByRole('button', {name:'已解决', exact:true}).click()
  await expect(panel.getByRole('status')).toContainText('没有需处理')
  await panel.getByRole('button', {name:'返回全部问题'}).click()
  await expect(panel.locator('[data-notice-id="1"]')).toContainText('未标记')
  await expect(resolved.locator('.bug-disclosure')).toHaveAttribute('aria-expanded', 'true')
  await expect(resolved.getByRole('button', {name:'重新打开', exact:true})).toBeVisible()
  expect(writes).toEqual([{id:2,status:'action'}, {id:2,status:'resolved'}])

  const record = panel.locator('[data-notice-id="1"]')
  await record.getByRole('button', {name:'加入处理', exact:true}).click()
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
  await panel.getByRole('button', {name:'已解决', exact:true}).click()
  await expect(panel.locator('.bug-item')).toHaveCount(1)
  await expect(panel.locator('[data-notice-id="5"]')).toBeVisible()
  await expect(panel.getByRole('status')).toContainText('剩余 1 条')
  expect(writes).toEqual([{id:4,status:'resolved'}])
})

test('客户从项目清单继续调整原需求，发送失败时保留说明，重试后只重新打开一次', async ({page}) => {
  await fixture(page, 'customer')
  await page.addInitScript(() => localStorage.setItem('customerToken','fixture-customer'))
  const bug = {...order.bugs[0], id:15, status:'resolved', progressStatus:'resolved', updates:[]}
  const project = {...order, bugs:[bug], version:1}
  const writes = []
  await page.route('**/jiedan/portal/orders/1', r => r.fulfill({json:{code:200, data:project}}))
  await page.route('**/jiedan/portal/orders/1/version', r => r.fulfill({json:{code:200, data:{version:project.version}}}))
  await page.route('**/jiedan/portal/bug/15/update', r => {
    const payload = r.request().postDataJSON()
    writes.push(payload)
    if (writes.length === 1) return r.fulfill({json:{code:503,msg:'暂时无法处理'}})
    bug.status = 'open'
    bug.progressStatus = 'action'
    bug.updates.push({id:32, senderKind:'customer', content:payload.content, attachments:[]})
    project.version++
    return r.fulfill({json:{code:200, data:project}})
  })
  await page.goto('/#/projects/1?tab=bugs')
  const card = page.locator('#requirement-15')
  await card.getByRole('button', {name:'还要调整'}).click()
  const composer = page.locator('.issue-composer')
  const field = composer.getByRole('textbox', {name:'补充这条需求'})
  const send = composer.getByRole('button', {name:'发送', exact:true})
  const note = '图上的按钮还需要往上移'
  await expect(page).toHaveURL(/issue=15/)
  await expect(composer).toContainText('发送说明后将重新打开这条需求')
  await field.fill(note)
  await send.click()
  await expect(page.getByText('暂时无法处理')).toBeVisible()
  await expect(card.locator('.requirement-status')).toHaveText('已解决')
  await expect(field).toHaveValue(note)
  await send.click()
  await expect(card.locator('.requirement-status')).toHaveText('等团队处理')
  await expect(card.locator('.bug-updates')).toContainText(note)
  await expect(field).toHaveValue('')
  expect(writes).toHaveLength(2)
  expect(writes[0]).toMatchObject({reopen:true, content:note, requestKey:expect.any(String)})
  expect(writes[1]).toEqual(writes[0])
})
