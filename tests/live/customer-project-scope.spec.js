const { test, expect } = require('@playwright/test')
const { randomUUID } = require('node:crypto')

test('项目内创建的客户仅供该项目选择；保存、解绑和恢复草稿均不串项目', async ({ request }) => {
  const base = process.env.E2E_BASE
  if (!base || new URL(base).hostname !== '127.0.0.1' || !/^xc_e2e_\d+$/.test(process.env.E2E_DB)) throw Error('需要本地隔离测试库')
  const call = async (path, token, method = 'GET', data) => (await request.fetch(base + path, {
    method, data, headers: token ? { Authorization: 'Bearer ' + token } : {}
  })).json()
  const ok = async (...args) => { const r = await call(...args); expect(r.code, r.msg).toBe(200); return r.data }
  const login = async (username, password) => {
    const r = await call('/login', null, 'POST', { username, password })
    expect(r.code, r.msg).toBe(200); return r.token
  }
  const admin = await login('admin', 'admin123')
  const customers = '/jiedan/customer', orders = '/jiedan/order'
  const create = extra => ok(customers, admin, 'POST', { autoUsername: true, password: '123456', ...extra })
  const make = data => ok(orders, admin, 'POST', data)
  const picker = async ctx => (await ok(customers + '/list?picker=true&' + new URLSearchParams(ctx), admin)).map(x => x.userName)
  const memberships = async token => (await ok('/jiedan/portal/orders', token)).map(o => o.id)
  const general = await create({})
  const a = await make({ title: '独立项目 A', customerAccount: general.userName })
  const b = await make({ title: '独立项目 B', customerAccount: general.userName })
  const single = await create({ projectId: a.id })
  const body = { count: 2, requestKey: randomUUID(), projectId: a.id }
  const batch = await ok(customers + '/batch', admin, 'POST', body)
  expect((await call(customers + '/batch', admin, 'POST', { ...body, projectId: b.id })).code).not.toBe(200)
  for (const account of [single, ...batch]) {
    expect(await picker({ projectId: a.id })).toContain(account.userName)
    expect(await picker({ projectId: b.id })).not.toContain(account.userName)
    expect(await picker({})).not.toContain(account.userName)
  }
  expect(await picker({ projectId: b.id })).toContain(general.userName)
  expect((await ok(customers + '/list', admin)).map(c => c.userName)).toContain(single.userName)
  const token = await login(single.userName, '123456')
  expect(await memberships(token)).toEqual([])
  await ok(orders, admin, 'PUT', { id: a.id, testerIds: [single.userId, ...batch.map(c => c.userId)], previousTesterIds: [] })
  expect(await memberships(token)).toEqual([a.id])
  for (const update of [{ customerAccount: single.userName }, { testerIds: [single.userId], previousTesterIds: [] }]) {
    const r = await call(orders, admin, 'PUT', { id: b.id, ...update })
    expect(r.code).not.toBe(200); expect(r.msg).toContain('不属于当前项目')
  }
  expect((await ok(orders + '/' + b.id, admin)).customerAccount).toBe(general.userName)
  expect((await ok(orders + '/' + b.id, admin)).testerIds).toEqual([])
  await ok(orders, admin, 'PUT', { id: a.id, testerIds: [], previousTesterIds: [single.userId, ...batch.map(c => c.userId)] })
  expect(await memberships(token)).toEqual([])
  expect(await picker({projectId: b.id})).not.toContain(single.userName)
  expect((await call(orders, admin, 'POST', { title: '跨项目创建不生效', customerAccount: single.userName })).code).not.toBe(200)
  const draftKey = randomUUID()
  const draft = await create({ draftKey })
  const draftToken = await login(draft.userName, '123456')
  expect(await picker({draftKey})).toContain(draft.userName)
  expect(await picker({draftKey:randomUUID()})).not.toContain(draft.userName)
  expect(await picker({})).not.toContain(draft.userName)
  expect(await memberships(draftToken)).toEqual([])
  const saved = await make({ title: '从草稿保存', customerAccount: draft.userName, customerDraftKey: draftKey })
  expect(await picker({ projectId: saved.id })).toContain(draft.userName)
  expect(await memberships(draftToken)).toEqual([saved.id])
  expect((await call(orders, admin, 'POST', {title: '重复使用草稿', customerDraftKey: draftKey})).code).not.toBe(200)
  expect(await picker({projectId: a.id})).not.toContain(draft.userName)
  expect((await ok(orders+'/list',admin)).filter(o => ['跨项目创建不生效','重复使用草稿'].includes(o.title))).toHaveLength(0)
})
