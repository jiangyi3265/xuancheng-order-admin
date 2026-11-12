const { test, expect } = require('@playwright/test')

for (const width of [1440, 390]) {
  test('项目管理待处理逐项跳转、完成与返回 ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.goto('/#/login')
    await page.getByPlaceholder('请输入登录账号').fill('admin')
    await page.getByPlaceholder('请输入密码', {exact:true}).fill('admin123')
    await page.getByRole('button', {name:'登录',exact:true}).click()
    await expect(page).not.toHaveURL(/#\/login$/)
    const token = await page.evaluate(() => localStorage.getItem('token'))
    const api = async (path, method = 'GET', data) => {
      const res = await page.request.fetch(path, {method, data, headers:{Authorization:'Bearer ' + token}})
      const body = await res.json()
      expect(body.code, body.msg).toBe(200)
      return body.data
    }
    const title = '跟进-' + Date.now()
    const order = await api('/jiedan/order', 'POST', {title,status:'doing'})
    const path = '/jiedan/order/' + order.id
    const view = width === 390 ? 'list' : 'kanban'
    const area = page.getByRole('region',{name:/^待处理/})
    const links = area.getByRole('link').filter({hasText:title})
    const showAll = async () => {
      const toggle = area.getByRole('button', {name:/^待处理/})
      if (width === 390 && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
      await expect(area.getByRole('link').first()).toBeVisible()
      const btn = area.getByRole('button',{name:/查看全部/})
      if (await btn.isVisible()) await btn.click()
    }
    const close = () => page.locator(width === 390 ? '.workspace-head .board-detail-close' : '.workspace-head .close-btn').click()
    try {
      await api(path + '/next', 'PUT', { content: '给客户看初稿' })
      await api(path + '/urgency', 'PUT', { urgentUntil: '2028-06-15 17:30', previousUntil: null })
      for (const content of ['改字号', '改颜色', '仅记录']) {
        const updated = await api('/jiedan/order/bug','POST',{orderId:order.id,content})
        if (content !== '仅记录') {
          const target = updated.bugs.find(b=>b.content===content)
          await api('/jiedan/order/bug/' + target.id + '/status','PUT',{status:'action'})
        }
      }
      await page.evaluate(mode => localStorage.setItem('xc.orderView',mode),view)
      await page.goto('/#/order')
      await page.reload()
      await expect(area.getByRole('heading')).toBeVisible()
      await showAll()
      await expect(links).toHaveCount(4)
      await expect(area).not.toContainText('仅记录')
      if (view === 'kanban') {
        await page.getByRole('button',{name:'展开进行中',exact:true}).click()
        const group = page.getByRole('dialog',{name:'全屏看板'})
        await group.locator('.focus-card').filter({hasText:title}).getByRole('button',{name:'加入待处理'}).click()
        await expect(group.locator('.focus-card').filter({hasText:title})).toContainText('标记于')
        await group.getByRole('button',{name:'返回看板'}).click()
      } else {
        const current = await api(path)
        await api(path+'/handling','PUT',{handled:false,version:current.version})
        await page.reload()
        await expect(area).toContainText('待处理')
      }
      await showAll()
      await expect(links).toHaveCount(5)
      const colorRow = area.getByRole('listitem').filter({has:page.getByRole('link').filter({hasText:'改颜色'})})
      const remind = colorRow.getByRole('button',{name:/提醒/})
      const bugId = Number(new URLSearchParams((await colorRow.getByRole('link',{name:'看一下',exact:true}).getAttribute('href')).split('?')[1]).get('bug'))
      const noticeRoute = '**' + path + '/pending-reminder'
      const requests = []
      let finishSend
      const pause = new Promise(resolve => { finishSend = resolve })
      await page.route(noticeRoute,async route=>{
        requests.push(route.request().postDataJSON())
        await pause
        await route.fulfill({json:{code:200}})
      })
      await remind.click()
      await expect(remind).toBeDisabled()
      await expect(page.locator('.workspace-head')).toBeHidden()
      finishSend()
      await expect(page.locator('.el-message--success').filter({hasText:'发送微信提醒'})).toBeVisible()
      await expect(remind).toBeEnabled()
      expect(requests).toEqual([{kind:'bug',bugId,version:expect.any(Number)}])
      await page.unroute(noticeRoute)
      // The isolated backend has no configured WeCom application.
      await remind.click()
      await expect(page.locator('.el-message--error').filter({hasText:/企业微信|微信提醒已关闭/})).toBeVisible()
      await expect(remind).toBeEnabled()
      await links.filter({hasText:'改颜色'}).click()
      const bug = page.locator('.bug-item.notice-target')
      await expect(bug).toBeInViewport()
      await expect(bug.locator('.bug-summary-title')).toHaveText('改颜色')
      await bug.getByText('已解决',{exact:true}).click()
      await expect.poll(async ()=>(await api(path)).actionBugPreviews.length).toBe(1)
      await page.goBack()
      await expect(page.locator('.workspace-head')).toBeHidden()
      await expect(links.filter({hasText:'改颜色'})).toHaveCount(0)
      await links.filter({hasText:'加急'}).click()
      await expect(page.locator('.workspace-head .urgency-trigger')).toContainText('17:30')
      await close()
      await links.filter({hasText:'手动标记'}).click()
      await expect(page.locator('.workspace-head h2')).toHaveText(title)
      await page.locator('.detail-handling').getByRole('button',{name:'完成'}).click()
      await expect(page.locator('.detail-handling .handling-state')).toHaveText('已处理')
      await close()
      await expect(links).toHaveCount(2)
      await links.filter({hasText:'给客户看初稿'}).click()
      await expect(page.locator('.workspace-next .ns-content')).toHaveText('给客户看初稿')
      await close()
      await page.reload()
      await expect(area).toBeVisible()
      await showAll()
      await expect(links).toHaveCount(2)
    } finally {
      await api(path,'DELETE')
    }
  })
}
