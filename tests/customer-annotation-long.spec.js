const {test, expect} = require('@playwright/test')
const {login} = require('./fixtures.cjs')
const {readMockUpload} = require('./annotation-fixture.cjs')

test('长截图滚到底部后圈选，发送的整张图仍在同一位置显示圈线', async ({page,browserName}, testInfo) => {
  await page.setViewportSize({width:390,height:750})
  const uploadedFile = await readMockUpload(page,browserName)
  await login(page,'customer')
  const sample = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 5200
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0,0,canvas.width,canvas.height)
    ctx.fillStyle = '#27394c'
    ctx.font = '20px sans-serif'
    for (let y=100; y<canvas.height; y+=400) ctx.fillText('界面截图 '+y, 10, y)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  let exported
  const sourcePath = '/annotation-test/long.png'
  await page.route('**'+sourcePath,route=>route.fulfill({contentType:'image/png',body:Buffer.from(sample,'base64')}))
  await page.route('**/annotation-test/marked.png', route=>route.fulfill({
    contentType:exported.type,body:Buffer.from(exported.data,'base64')
  }))
  await page.route('**/jiedan/media/upload',async route => {
    const file = await uploadedFile(route.request())
    if (file.name !== 'long.png') {
      exported = {type:file.type, data:file.buffer.toString('base64')}
    }
    const url = exported ? '/annotation-test/marked.png' : sourcePath
    return route.fulfill({json:{code:200,data:{url,type:'image',ext:'png',name:file.name}}})
  })
  await page.goto('/#/intake')
  await page.locator('.att-uploader input[multiple]').setInputFiles({name:'long.png',mimeType:'image/png',buffer:Buffer.from(sample,'base64')})
  await page.getByRole('button',{name:/圈注/}).first().click()
  const dialog = page.getByRole('dialog',{name:'圈注图片'})
  await dialog.getByRole('button',{name:'适合宽度',exact:true}).click()
  const stage = dialog.locator('.annotation-stage')
  const surface = dialog.locator('.annotation-surface')
  await expect.poll(()=>stage.evaluate(el=>el.scrollHeight / el.clientHeight)).toBeGreaterThan(2)
  await stage.evaluate(el=>el.scrollTo(0,el.scrollHeight))
  await dialog.getByRole('button',{name:'画圈',exact:true}).click()
  const frame = await stage.boundingBox(), img = await surface.boundingBox()
  const top = Math.max(img.y,frame.y), bottom = Math.min(img.y+img.height,frame.y+frame.height)
  const from = {x:img.x+img.width*.22,y:top+(bottom-top)*.25}
  const to = {x:img.x+img.width*.76,y:top+(bottom-top)*.75}
  await page.mouse.move(from.x,from.y)
  await page.mouse.down()
  await page.mouse.move(to.x,to.y,{steps:10})
  await page.mouse.up()
  await expect(dialog.getByRole('button',{name:'撤销',exact:true})).toBeEnabled()
  await dialog.screenshot({path:testInfo.outputPath('long-annotation.png')})
  await dialog.getByRole('button',{name:'保存圈注',exact:true}).click()
  await expect.poll(()=>!!exported).toBe(true)

  const extreme = await page.evaluate(async file => {
    const img = new Image()
    img.src = 'data:'+file.type+';base64,'+file.data
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img,0,0)
    const {data} = ctx.getImageData(0,0,canvas.width,canvas.height)
    let minX=canvas.width, minY=canvas.height, maxX=-1, maxY=-1
    for (let offset=0; offset<data.length; offset+=4) {
      if (data[offset]<160 || data[offset]-data[offset+1]<60 || data[offset]-data[offset+2]<50) continue
      const position=offset/4, x=position%canvas.width, y=Math.floor(position/canvas.width)
      minX=Math.min(minX,x); maxX=Math.max(maxX,x); minY=Math.min(minY,y); maxY=Math.max(maxY,y)
    }
    return {width:canvas.width,height:canvas.height,minX:minX/canvas.width,maxX:maxX/canvas.width,minY:minY/canvas.height,maxY:maxY/canvas.height}
  },exported)
  expect([extreme.width,extreme.height]).toEqual([600,5200])
  expect(extreme.minY).toBeGreaterThan(.7)
  for (const [bound,position] of Object.entries({
    minX:(from.x-img.x)/img.width, maxX:(to.x-img.x)/img.width,
    minY:(from.y-img.y)/img.height, maxY:(to.y-img.y)/img.height
  })) expect(Math.abs(extreme[bound]-position), bound).toBeLessThan(.022)
})
