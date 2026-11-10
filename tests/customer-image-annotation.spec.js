const {test, expect} = require('@playwright/test')
const {fixture, order} = require('./fixtures.cjs')
const {editor, screenshotFile, draw, expectMarkedImage, readMockUpload} = require('./annotation-fixture.cjs')

test.use({hasTouch:true})
for (const width of [390,1440]) {
  test('客户圈注后上传失败可以重试，取消和刷新能保留正确附件 '+width, async ({page,browserName}) => {
    await page.setViewportSize({width,height:840})
    await fixture(page, 'customer')
    await page.addInitScript(() => {
      localStorage.setItem('customerToken','fixture-customer')
      localStorage.setItem('customerAccount','fixture')
    })
    await page.route('**/jiedan/portal/orders', route => route.fulfill({json:{code:200,data:[{...order,requirements:[]}]}}))
    const uploads = new Map()
    const uploadedFile = await readMockUpload(page,browserName)
    let failSave = false
    await page.route('**/jiedan/media/annotation-test-*', route => {
      const image = uploads.get(new URL(route.request().url()).pathname)
      return route.fulfill({body:image.buffer,contentType:image.type})
    })
    await page.route('**/jiedan/media/upload', async route => {
      const file = await uploadedFile(route.request())
      if (failSave) {
        failSave = false
        return route.fulfill({json:{code:500,msg:'圈注上传测试失败，请重试'}})
      }
      const url = '/jiedan/media/annotation-test-'+(uploads.size+1)+'.png'
      uploads.set(url,file)
      return route.fulfill({json:{code:200,data:{url,name:file.name,type:'image',size:file.buffer.length}}})
    })
    await page.goto('/client/#/intake')
    await expect(page.locator('.project-context')).toContainText(order.title)
    const submit = page.locator('form.request-panel .submit')
    const upload = page.locator('form input[type=file]')
    await upload.setInputFiles(await screenshotFile(page,'首页截图.png'))
    const entry = page.getByRole('button',{name:/^圈注/}).first()
    await entry.click()
    const dialog = editor(page)
    const save = dialog.getByRole('button',{name:'保存圈注',exact:true})
    await expect(save).toBeDisabled()
    await draw(page,'画圈')
    await dialog.getByRole('button',{name:'撤销',exact:true}).click()
    await expect(save).toBeDisabled()
    await dialog.getByRole('button',{name:'取消',exact:true}).click()
    await expect(dialog).toBeHidden()
    expect(uploads.size).toBe(1)
    await entry.click()
    const touch = width === 390 && browserName === 'chromium'
    await draw(page,'画圈',touch)
    await draw(page,'箭头',touch)
    failSave = true
    await save.click()
    await expect(page.getByText(/圈注上传测试失败/).first()).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(submit).toBeDisabled()
    expect(uploads.size).toBe(1)
    await save.click()
    await expect(dialog).toBeHidden()
    expect(uploads.size).toBe(2)
    await page.reload()
    await expect(submit).toBeEnabled()
    await page.locator('.att-uploader .media-thumb button.thumb-open').click()
    const preview = page.locator('dialog.fullscreen-image')
    await expectMarkedImage(preview.locator('img'))
    await preview.getByRole('button',{name:'关闭图片预览'}).click()
    const posted = page.waitForRequest(r => r.url().endsWith('/jiedan/order/intake') && r.method()==='POST')
    await submit.click()
    const data = (await posted).postDataJSON()
    expect(data.attachments).toHaveLength(1)
    expect(data.attachments[0].url).toBe([...uploads.keys()][1])
    await expect(page.getByRole('heading',{name:'提交成功'})).toBeVisible()
  })
}
