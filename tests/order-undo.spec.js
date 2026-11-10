const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

async function project(page, extra = {}) {
  const row = { ...order, unread: [], version: 10, ...extra }
  const state = { row, deleted: false, failUndo: false, statusWrites: [] }
  const ok = (route, data) => route.fulfill({ json: { code: 200, data } })
  const changed = (route, patch) => { Object.assign(row, patch); row.version++; return ok(route, row) }
  await fixture(page)
  await page.setViewportSize({ width: 1366, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fixture-boss')
    localStorage.setItem('xc.orderView', 'kanban')
  })
  await page.route('**/jiedan/order/list', r => ok(r, state.deleted ? [] : [row]))
  await page.route('**/jiedan/order/1', r => {
    if (r.request().method() === 'DELETE') { state.deleted = true; return ok(r) }
    return ok(r, row)
  })
  await page.route('**/jiedan/order/read', r => ok(r, {id:row.id,version:row.version}))
  await page.route('**/jiedan/order/1/version', r => ok(r, {version:row.version}))
  await page.route('**/jiedan/order/status', r => {
    const {status} = r.request().postDataJSON()
    if (state.failUndo) return r.fulfill({json:{code:503,msg:'连接中断，请重试'}})
    state.statusWrites.push(status)
    return changed(r, {status})
  })
  await page.route('**/jiedan/order/1/restore', r => { state.deleted = false; return ok(r) })
  await page.route('**/jiedan/order/1/payment', r => changed(r, {receivedAmount:row.receivedAmount+r.request().postDataJSON().amount}))
  await page.route('**/jiedan/order/1/next/done', r => changed(r, {nextStep:'',nextOwnerId:null,nextDue:''}))
  await page.route('**/jiedan/order/1/next', r => {
    const {content,ownerId,due} = r.request().postDataJSON()
    return changed(r, {nextStep:content,nextOwnerId:ownerId,nextDue:due})
  })
  await page.route('**/jiedan/order', r => {
    const {ownerId} = r.request().postDataJSON()
    return changed(r, {ownerId,assignState:ownerId===1?'':'pending'})
  })
  await page.goto('/#/order?id=1')
  await expect(page.locator('.workspace-head h2')).toHaveText(row.title)
  return state
}

const undo = page => page.getByRole('button', {name:'撤销', exact:true})
async function status(page, name) {
  await page.locator('.status-select').click()
  await page.getByRole('option', {name,exact:true}).click()
}

test('状态撤销写回原值，断网保留实际状态，其他人的下一次修改不被撤销覆盖', async ({page}) => {
  const s = await project(page)
  await status(page,'待验收')
  await undo(page).click()
  await expect.poll(() => s.statusWrites).toEqual(['review','doing'])
  await expect(page.locator('.status-select')).toContainText('进行中')
  await status(page,'待验收')
  s.failUndo = true
  await undo(page).click()
  await expect(page.getByText(/撤销失败.*连接中断/)).toBeVisible()
  await expect(page.locator('.status-select')).toContainText('待验收')
  s.failUndo = false
  await status(page,'进行中')
  Object.assign(s.row,{status:'pending',version:s.row.version+1})
  await undo(page).click()
  await expect(page.getByText(/撤销失败.*已有新变化/)).toBeVisible()
  await expect(page.locator('.status-select')).toContainText('待确认')
})

test('改派能派回原负责人，完成下一步后撤销能恢复内容、负责人和日期',async({page})=>{
  const s = await project(page,{nextStep:'发送第二版',nextOwnerId:1,nextDue:'2026-11-17'})
  await page.locator('.inline-assign').click()
  await page.getByRole('menuitem',{name:/我自己/}).click()
  await expect.poll(()=>s.row.ownerId).toBe(1)
  await undo(page).click()
  await expect.poll(()=>s.row.ownerId).toBe(2)
  await page.locator('.next-step').getByRole('button',{name:'完成',exact:true}).click()
  await expect.poll(()=>s.row.nextStep).toBe('')
  await page.locator('.el-message').filter({hasText:'已完成「发送第二版」'}).getByRole('button',{name:'撤销'}).click()
  await expect(page.locator('.ns-content')).toHaveText('发送第二版')
  expect(s.row.nextOwnerId).toBe(1)
  expect(s.row.nextDue).toBe('2026-11-17')
})

test('单个项目立即进入回收站，撤销后重新显示在看板',async({page})=>{
  const s=await project(page)
  let attempts = 0
  await page.route('**/jiedan/order/status',r=>r.fulfill({json:{code:500,msg:'状态提交暂时失败 '+(++attempts)}}))
  for (let attempt=1;attempt<=3;attempt++) {
    await status(page,'待验收')
    await expect(page.getByText('状态提交暂时失败 '+attempt)).toBeVisible()
  }
  await expect(page.locator('.el-message:visible')).toHaveCount(3)
  await page.locator('.head-actions').getByRole('button',{name:'更多'}).click()
  await page.getByRole('menuitem',{name:'删除',exact:true}).click()
  await expect.poll(()=>s.deleted).toBe(true)
  await expect(page.getByRole('dialog',{name:'删除项目'})).toHaveCount(0)
  await undo(page).click()
  await expect(page.locator('.kanban .card').filter({hasText:s.row.title})).toBeVisible()
  expect(s.deleted).toBe(false)
})

test('完成后跳过记款才提供撤销，已记收款时保留结清状态',async({page})=>{
  const s=await project(page)
  await status(page,'已完成')
  const settle=page.getByRole('dialog',{name:'完成了，这单收到钱了吗？'})
  await expect(settle).toBeVisible()
  await expect(undo(page)).toHaveCount(0)
  await settle.getByRole('button',{name:'还没收，先挂着'}).click()
  await undo(page).click()
  await expect.poll(()=>s.row.status).toBe('doing')
  await status(page,'已完成')
  await settle.getByRole('button',{name:/已收清/}).click()
  await expect(settle).toBeHidden()
  await expect(undo(page)).toHaveCount(0)
  expect(s.row.receivedAmount).toBe(s.row.amount)
})

test('看板拖到待验收后可从提示直接撤回进行中',async({page})=>{
  const s=await project(page)
  await page.locator('.workspace-head .close-btn').click()
  const source=page.locator('[data-status="doing"] .card').filter({hasText:s.row.title})
  const target=page.locator('.kanban [data-status="review"]')
  await source.dragTo(target,{sourcePosition:{x:30,y:45},targetPosition:{x:40,y:30}})
  await expect.poll(()=>s.row.status).toBe('review')
  await undo(page).click()
  await expect(source).toBeVisible()
  expect(s.row.status).toBe('doing')
})

test('三条待撤销都在时错误提示会在空出位置后显示',async({page})=>{
  await project(page,{nextStep:'发第二版',nextOwnerId:1,nextDue:'2026-11-17'})
  await status(page,'待验收')
  await page.locator('.inline-assign').click()
  await page.getByRole('menuitem',{name:/我自己/}).click()
  const step = page.locator('.next-step')
  await step.getByRole('button',{name:'完成',exact:true}).click()
  await expect(undo(page)).toHaveCount(3)

  let attempted = false
  await page.route('**/jiedan/order/1/next',async r=>{
    attempted = true
    await r.fulfill({json:{code:500,msg:'保存下一步失败，请稍后重试'}})
  })
  await step.locator('.ns-input input').fill('我来检查')
  await step.getByRole('button',{name:'保存',exact:true}).click()
  await expect.poll(()=>attempted).toBe(true)
  await expect(step.getByRole('button',{name:'保存',exact:true})).not.toHaveClass(/is-loading/)
  const warning=page.getByText('保存下一步失败，请稍后重试')
  expect(await warning.count()).toBe(0)
  const assignment = page.locator('.el-message').filter({hasText:'已转到你自己名下'})
  await assignment.getByRole('button',{name:'撤销'}).click()
  await expect(warning).toBeVisible()
  await expect(undo(page)).toHaveCount(2)
})
