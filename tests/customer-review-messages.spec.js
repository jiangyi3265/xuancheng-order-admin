const { test, expect } = require('@playwright/test')
const { fixture, order } = require('./fixtures.cjs')

test('消息保留待确认和后续普通回复，同一条确认只显示一次', async ({page}) => {
  await fixture(page,'customer')
  await page.addInitScript(()=>{localStorage.setItem('customerToken','fixture-customer');localStorage.setItem('customerAccount','client')})
  const reply=(id,content)=>({id,content,unread:true,time:'2026-11-08 11:00'})
  await page.route('**/jiedan/portal/orders',route=>route.fulfill({json:{code:200,data:[{
    ...order,requirements:[
      {id:12,title:'按钮改名',status:'confirm',reviewId:66,reviewTime:'2026-11-08 10:50',latestTeamReply:reply(66,'已更改按钮')},
      {id:13,title:'首页配色',status:'confirm',reviewId:67,reviewTime:'2026-11-08 10:51',latestTeamReply:reply(71,'稍后再发一份原图')},
      {id:14,title:'页脚电话',status:'action',latestTeamReply:reply(72,'号码已收到')}
    ]
  }]}}))
  await page.goto('/#/customer/messages')
  const cards=page.locator('.message-card')
  await expect(cards.filter({hasText:'等你确认'})).toHaveCount(2)
  await expect(cards.nth(0)).toHaveAttribute('href',/issue=13&review=67/)
  await expect(cards.nth(1)).toHaveAttribute('href',/issue=12&review=66/)
  await expect(cards.filter({hasText:'按钮改名'})).toHaveCount(1)
  await expect(cards.filter({hasText:'稍后再发一份原图'})).toHaveAttribute('href',/issue=13&update=71/)
  await expect(cards.filter({hasText:'号码已收到'})).toHaveAttribute('href',/issue=14&update=72/)
})
