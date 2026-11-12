const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')
const ok = (route, data) => route.fulfill({ json: { code: 200, data } })

async function enter(page, role = 'boss') {
  await fixture(page, role)
  await page.addInitScript(role => localStorage.setItem(role === 'customer' ? 'customerToken' : 'token', 'fixture-' + role), role)
}

for (const routeName of ['workbench','dashboard']) {
  test(routeName + ' 首次加载、失败重试和真实空数据分开显示', async ({ page }) => {
    await enter(page)
    let release
    const gate = new Promise(resolve => { release = resolve })
    let online = false
    await page.route('**/jiedan/order/list', async r => {
      await gate
      return online ? ok(r, []) : r.fulfill({ json: { code: 500, msg: '网络暂时断开' } })
    })
    await page.goto('/#/' + routeName)
    await expect(page.getByRole('status', { name: '正在加载项目' })).toBeVisible()
    await expect(page.getByText(/当前没有轮到你的事项|手上没有单子/)).toHaveCount(0)
    release()
    await expect(page.getByRole('alert').filter({hasText:'项目没加载出来'})).toContainText('网络暂时断开')
    online = true
    await page.getByRole('button',{name:'重试',exact:true}).click()
    await expect(page.locator('.project-load-state')).toHaveCount(0)
    await expect(page.locator(routeName === 'workbench' ? '.wb-person' : '.income-hero')).toBeVisible()
  })
}

for (const role of ['boss', 'customer']) {
  test(role + ' 沟通能打开网址，保留历史阅读位置，支持跳到最新', async ({ page }) => {
    await enter(page, role)
    const isCustomer = role === 'customer'
    const api = isCustomer ? '/jiedan/portal/orders/1' : '/jiedan/order/1'
    const time = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'))
    const timeline = Array.from({ length: 44 }, (_, i) => ({
      id: 100 + i, type: 'message', user: '林女士', time: time + ' 16:20:00', content: '第' + (i+1) + '条消息', attachments: []
    }))
    timeline[0].content = '<img onerror=alert(1)> 参考 https://example.com/a?b=1。'
    let version = 1
    await page.route('**' + api, r => ok(r, { ...order, timeline, version }))
    await page.route('**' + api + '/version', r => ok(r, { version }))
    await page.goto(isCustomer ? '/#/projects/1?tab=chat' : '/#/order?id=1&tab=chat')
    const list = page.locator(isCustomer ? 'main.scroll' : '.chat-list')
    const link = list.getByRole('link', {name:'https://example.com/a?b=1'})
    await expect(link).toHaveAttribute('href','https://example.com/a?b=1')
    await expect(link).toHaveAttribute('rel','noopener noreferrer')
    await expect(list).toContainText('<img onerror=alert(1)>')
    await expect(list.locator('.meta')).toHaveCount(1)
    await expect(list.locator('time').first()).toHaveText('今天 16:20')
    const gap = () => list.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)
    await expect.poll(gap).toBeLessThan(5)
    await list.evaluate(el => { el.scrollTop = 0 })
    timeline.push({ ...timeline[0], id: 200, type: 'reply', user: '小陈', content: '新的处理进展' })
    version++
    const jump = page.getByRole('button',{name:'有新消息 ↓'})
    await expect(jump).toBeVisible({timeout:12000})
    expect(await list.evaluate(el => el.scrollTop)).toBeLessThan(10)
    await jump.click()
    await expect.poll(gap).toBeLessThan(5)
    await expect(jump).toBeHidden()
  })
}

test('手机提示在底栏上方，同文合并且有数量上限', async ({page}) => {
  await enter(page)
  await page.goto('/#/workbench')
  await expect(page.locator('.wb-person')).toBeVisible()
  await page.evaluate(async () => {
    const {toast} = await import('/src/utils/toast.js')
    for (let i = 0; i < 5; i++) toast.warning('重复操作')
    toast.error('另一条提示')
    toast.success('已保存测试')
    toast.info('第四条提示')
  })
  const shown = page.locator('.el-message:visible')
  await expect(shown).toHaveCount(3)
  await expect(shown.filter({hasText:'重复操作'})).toHaveCount(1)
  expect((await shown.first().boundingBox()).y).toBeGreaterThan(200)
})

test('电脑版极速建单在标题栏，空客户列表提供创建并保护已填内容', async ({page}) => {
  await enter(page)
  await page.setViewportSize({width:1366,height:850})
  await page.route('**/jiedan/customer/list*', r => ok(r, []))
  await page.goto('/#/customers')
  await expect(page.locator('.header').getByRole('button',{name:'极速建单'})).toBeVisible()
  await page.locator('.el-table .el-empty').getByRole('button',{name:'新建客户账号'}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('客户登录用，字母/数字').fill('example')
  await dialog.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'继续填'}).click()
  await expect(dialog.getByPlaceholder('客户登录用，字母/数字')).toHaveValue('example')
})

test('数据统计的状态、渠道和成员图表均可点开对应筛选', async ({page}) => {
  await enter(page)
  await page.setViewportSize({width:1366,height:850})
  for (const [title, label, query] of [['项目状态分布','进行中','status=doing'],['渠道来源占比','微信','channel=wechat'],['成员工作量对比','小陈','owner=2']]) {
    await page.goto('/#/dashboard')
    const card = page.locator('.chart-card').filter({hasText:title})
    const canvas = card.locator('canvas')
    await canvas.scrollIntoViewIfNeeded()
    // ECharts supplies pixel coordinates for each rendered bar / slice, independent of screen size.
    const container = card.locator('[_echarts_instance_]')
    const chartPoint = await container.evaluate(async (el, name) => {
      const {getInstanceByDom} = await import(performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/echarts.js')).name)
      const chart = getInstanceByDom(el)
      const series = chart.getModel().getSeriesByIndex(0)
      const data = series.getData()
      const index = data.indexOfName(name)
      const layout = data.getItemLayout(index)
      if (series.subType === 'bar') return {x:layout.x+layout.width/2,y:layout.y+layout.height/2}
      const angle = (layout.startAngle+layout.endAngle)/2, radius = (layout.r+layout.r0)/2
      return {x:layout.cx+Math.cos(angle)*radius,y:layout.cy+Math.sin(angle)*radius}
    },label)
    await canvas.click({position:chartPoint})
    await expect(page).toHaveURL(new RegExp(query))
  }
})

test('显示日期保留完整时间，金额统一千分位并保留报价单的小数', async ({page}) => {
  await enter(page)
  await page.goto('/#/workbench')
  const result = await page.evaluate(async () => {
    const {friendlyTime, fmtTime} = await import('/src/utils/time.js')
    const {money} = await import('/src/utils/payment.js')
    const {dateAfterDays} = await import('/src/utils/date.js')
    const time = dateAfterDays(0) + 'T16:20:38'
    return [friendlyTime(time), friendlyTime(dateAfterDays(-1) + ' 08:10:00'), friendlyTime('2020-02-03 09:00'), fmtTime(time), money(12680.5), money(12680.5, 2)]
  })
  expect(result).toEqual(['今天 16:20', '昨天 08:10', '2020年2月3日', expect.stringMatching(/\d{4}-\d{2}-\d{2} 16:20/), '¥12,680.5', '¥12,680.50'])
})
