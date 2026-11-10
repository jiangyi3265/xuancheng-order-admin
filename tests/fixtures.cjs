const {expect}=require('@playwright/test')
const members=[{id:1,userName:'boss',nickName:'管理员',role:'boss',roleLabel:'总管理员',status:'0',orderCount:3},{id:2,userName:'staff',nickName:'小陈',role:'employee',roleLabel:'员工',status:'0',orderCount:2}]
const order={id:1,title:'品牌官网设计',orderNo:'XC-2026-0001',customer:'林女士',contact:'微信联系',customerAccount:'client',ownerId:2,status:'doing',priority:'high',channel:'wechat',amount:8800,receivedAmount:3000,deadline:'2026-11-18',createTime:'2026-11-05 10:00:00',requirement:'设计开发企业品牌官网，包含首页、产品服务、案例展示和联系我们。',revisions:2,version:1,assignState:'accepted',unread:[1],attachments:[],payments:[{id:1,amount:3000,payDate:'2026-11-05',note:'项目定金'}],bugs:[{id:1,content:'移动端图片显示不全',status:'open',createdBy:'林女士',time:'2026-11-05 10:00',attachments:[],updates:[]}],timeline:[{id:1,type:'reply',user:'小陈',content:'请确认首页设计方案',time:'2026-11-05 10:00',attachments:[]},{id:2,type:'note',user:'小陈',content:'内部保密内容',time:'2026-11-05 10:01',attachments:[]}],messageCount:1,lastMessage:{type:'reply',user:'小陈',content:'请确认首页设计方案'}}
async function fixture(page,role='boss'){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/(captchaImage|getInfo|login|jiedan\/.*)(\?.*)?$/,async route=>{
 const path=new URL(route.request().url()).pathname;let body={code:200,data:null};
 if(path==='/captchaImage')body={code:200,captchaEnabled:false};
 else if(path==='/login')body={code:200,token:'fixture-'+role};
 else if(path==='/getInfo')body={code:200,roles:[role==='boss'?'admin':role==='employee'?'employee':'customer'],user:{nickName:role==='customer'?'林女士':'管理员'}};
 else if(path==='/jiedan/staff/me')body.data=members[role==='employee'?1:0];
 else if(path==='/jiedan/staff/list')body.data=role==='employee'?[members[1]]:members;
 else if(path==='/jiedan/order/stamp')body.data={stamp:'1'};
 else if(path==='/jiedan/order/list')body.data=[order,{...order,id:2,title:'餐饮点餐小程序',status:'review',unread:[]},{...order,id:3,title:'商城会员系统',status:'pending',assignState:'pending',unread:[]}];
 else if(path==='/jiedan/order/1'||path==='/jiedan/order/read')body.data=order;
 else if(path==='/jiedan/order/1/version'||path==='/jiedan/portal/orders/1/version')body.data={version:1};
 else if(path==='/jiedan/order/intake')body.data={id:1,bugId:11,title:order.title,orderNo:order.orderNo,createTime:'2026-11-08 12:00'};
 else if(path==='/jiedan/portal/orders')body.data=[{...order,receivedAmount:undefined,payments:undefined,timeline:order.timeline.filter(t=>t.type==='reply')}];
 else if(path==='/jiedan/portal/orders/1')body.data={...order,receivedAmount:undefined,payments:undefined,timeline:order.timeline.filter(t=>t.type==='reply')};
 else if(path==='/jiedan/approval/list')body.data=[{id:1,orderId:1,orderTitle:order.title,type:'amount',typeLabel:'报价调整',status:'pending',statusLabel:'待审批',requesterId:2,requesterName:'小陈',reason:'新增英文页面',summary:'报价 ¥8,800 → ¥9,800',createTime:'2026-11-05 10:00'}];
 else if(path==='/jiedan/customer/list')body.data=[{userId:3,userName:'client',nickName:'林女士',ownerId:2,ownerName:'小陈',projectCount:2,unfinishedCount:1,status:'0'}];
 else if(path==='/jiedan/order/trash')body.data=[{...order,deleteTime:'2026-11-05 10:00',deleteBy:'管理员'}];
 else if(path==='/jiedan/audit/list')body.data={rows:[{id:1,actorName:'管理员',actorRole:'boss',action:'payment.add',targetName:order.title,detail:'登记收款 ¥3,000',createTime:'2026-11-05 10:00',ip:'127.0.0.1'}],total:1};
 else if(path==='/jiedan/push/config')body.data={'push.enabled':'false','push.aheadDays':'0'};
 else if(path==='/jiedan/order/income')body.data={thisMonth:38600,total:88600,months:[{month:'2026-06',amount:12500},{month:'2026-07',amount:15800},{month:'2026-08',amount:19200},{month:'2026-09',amount:24700},{month:'2026-10',amount:30500},{month:'2026-11',amount:38600}]};
 else if(path.startsWith('/jiedan/order/notes/'))body.data={notes:'客户要求保留旧版配色',noteAttachments:[]};
 await route.fulfill({json:body});
 });return errors;
}
async function login(page,role){await fixture(page,role);await page.goto('/#/login');await page.getByPlaceholder('请输入登录账号').fill(role);await page.getByPlaceholder('请输入密码',{exact:true}).fill('test-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).toHaveURL(role==='customer'?/#\/projects/:/#\/workbench/)}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy()}

module.exports={fixture,login,noOverflow,order,members}
