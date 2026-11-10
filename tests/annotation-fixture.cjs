const {expect} = require('@playwright/test')

const editor = page => page.getByRole('dialog', {name:'圈注图片'})

// WebKit omits file bytes from Playwright's intercepted multipart bodies. For
// mocked uploads, capture its FormData file before fetch. Live tests use HTTP.
async function readMockUpload(page, browserName) {
  if (browserName !== 'webkit') return async request => {
    const response = new Response(request.postDataBuffer(), {headers:{'Content-Type':request.headers()['content-type']}})
    const file = (await response.formData()).get('file')
    return {name:file.name, type:file.type, buffer:Buffer.from(await file.arrayBuffer())}
  }
  const uploads = []
  await page.exposeFunction('recordAnnotationUpload', file => uploads.push({...file, buffer:Buffer.from(file.base64,'base64')}))
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window)
    window.fetch = async (url, init) => {
      if (url === '/jiedan/media/upload' && init?.body instanceof FormData) {
        const file = init.body.get('file')
        const data = await new Promise((resolve,reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        await window.recordAnnotationUpload({name:file.name,type:file.type,base64:data.split(',')[1]})
      }
      return fetchOriginal(url,init)
    }
  })
  return () => {
    const file = uploads.shift()
    if (!file) throw new Error('没有捕获到测试图片')
    return file
  }
}

async function screenshotFile(page, name) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#345a71'
    ctx.fillRect(0, 0, 18, 18)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  return {name, mimeType:'image/png', buffer:Buffer.from(data, 'base64')}
}

async function draw(page, tool, touch = false) {
  const dialog = editor(page)
  await dialog.getByRole('button', {name:tool, exact:true}).click()
  const surface = dialog.locator('.annotation-surface')
  await expect.poll(async () => (await surface.boundingBox())?.width || 0).toBeGreaterThan(20)
  const rect = await surface.boundingBox()
  const endpoints = tool === '画圈' ? [[.15,.2], [.45,.65]] : [[.56,.72], [.86,.28]]
  const [a,b] = endpoints.map(([x,y]) => ({x:rect.x + x * rect.width, y:rect.y + y * rect.height}))
  if (!touch) {
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, {steps:6})
    await page.mouse.up()
    return
  }
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[a]})
    for (let i=1; i<=6; i++) {
      const point = {x:a.x+(b.x-a.x)*i/6, y:a.y+(b.y-a.y)*i/6}
      await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[point]})
    }
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]})
  } finally { await cdp.detach() }
}

// Read the actual bitmap shown by the gallery, including its original background.
// Sampling at both extremes of the ellipse and arrow catches shifted exports.
async function expectMarkedImage(img) {
  await expect(img).toBeVisible()
  const result = await img.evaluate(async element => {
    await element.decode()
    const canvas = document.createElement('canvas')
    canvas.width = element.naturalWidth
    canvas.height = element.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(element,0,0)
    const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const pixel = (x,y) => {
      const i = (y * canvas.width + x) * 4
      return Array.from(data.slice(i,i+3))
    }
    const marks = (x,y) => {
      const left = Math.round(x*canvas.width), top = Math.round(y*canvas.height)
      let found = 0
      for (let dy=-9; dy<=9; dy++) for (let dx=-9; dx<=9; dx++) {
        const [r,g,b] = pixel(left+dx,top+dy)
        if (r > 145 && r-g > 75 && r-b > 60) found++
      }
      return found
    }
    return {size:[canvas.width,canvas.height],corner:pixel(5,5),center:marks(.3,.425),
      circle:[marks(.15,.425),marks(.3,.2),marks(.45,.425),marks(.3,.65)],
      arrow:[marks(.56,.72),marks(.71,.5),marks(.86,.28)]}
  })
  expect(result.size).toEqual([640,360])
  expect(result.corner[0]).toBeLessThan(85)
  expect(result.corner[2]).toBeGreaterThan(result.corner[0]+30)
  expect(result.center).toBe(0)
  for (const pixels of [...result.circle,...result.arrow]) expect(pixels,JSON.stringify(result)).toBeGreaterThan(0)
}

module.exports = {editor, screenshotFile, draw, expectMarkedImage, readMockUpload}
