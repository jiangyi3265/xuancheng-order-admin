<template><div class="inbox-page"><div class="page-heading"><div><h1>消息中心</h1><p>所有项目动态都在这里；要处理的事看工作台「需要我处理」</p></div><el-button v-if="unreadCount" :loading="marking" @click="readAll">全部已读（{{ unreadCount }}）</el-button><el-icon v-else class="heading-icon"><ChatDotRound /></el-icon></div>
<el-button class="system-notification-entry" :icon="Bell" @click="router.push('/settings')">系统通知设置</el-button>
<el-tabs v-model="tab"><el-tab-pane label="全部" name="all"/><el-tab-pane label="项目消息" name="projects"/><el-tab-pane label="审批提醒" name="approvals"/><el-tab-pane label="报价提醒" name="quotes"/></el-tabs>
<div class="message-list"><button v-for="item in items" :key="item.key" class="message-card" @click="router.push(item.path)"><span class="message-symbol"><el-icon><component :is="item.icon" /></el-icon></span><div><strong>{{ item.title }}</strong><p>{{ item.text }}</p><span class="muted" :title="fmtTime(item.time)">{{ item.caption }}</span></div><i v-if="item.unread" class="unread-dot"></i><el-icon><ArrowRight /></el-icon></button></div><el-empty v-if="!items.length" description="暂无新消息，项目动态会出现在这里" /></div></template>
<script setup>
import { colleagueTask } from '@/utils/todos'
import { money } from '@/utils/payment'
import { friendlyTime, fmtTime } from '@/utils/time'
import {quoteTodos, unreadQuotes, isQuoteUnread, markInboxRead} from '@/stores/quotes'
import {ref,computed} from 'vue'
import {Bell} from '@element-plus/icons-vue'
import {useRouter} from 'vue-router'
import { toast as ElMessage } from '@/utils/toast'
import {orders,approvals,currentMember,isBoss} from '@/mock/store'
import {statusMap,memberMap,MEMBERS} from '@/constants/options'
const router=useRouter(),tab=ref('all')
// 项目“有新动态”只能一个个点开才消失；这里可以一次清掉
const unreadCount=computed(()=>orders.filter(o=>o.unread?.includes(currentMember.value.id)).length + unreadQuotes.value.length)
const marking=ref(false)
async function readAll(){if(marking.value)return;marking.value=true;try{const r=await markInboxRead(currentMember.value.id);r.failed?ElMessage.warning(`已标记 ${r.total-r.failed} 条，${r.failed} 条失败，可以再点一次`):ElMessage.success(`已全部标为已读（${r.total} 条）`)}catch(e){ElMessage.error(e.message||'操作失败')}finally{marking.value=false}}
const labels={pending:'待审批',approved:'已通过',rejected:'已驳回',withdrawn:'已撤回'}
// 直接写出发生了什么（谁说了什么、几条问题），不用一个个点进去看；点开直达对应的分区
const stamp=t=>{const v=t?new Date(String(t).replace(' ','T')).getTime():0;return Number.isNaN(v)?0:v}

const brief=(s,n=40)=>{const t=String(s||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n)+'…':t}
function projectLine(o){
 const me=currentMember.value.id
 const pending=o.assignState==='pending'?{text:o.ownerId===me?'分配给你的新项目，等你接收':`等 ${memberMap[o.ownerId]?.name||'负责人'} 接收`,icon:'Document'}:null
 // 没有新动态、只是在等接收的，直接说等谁
 if(pending&&!o.unread?.includes(me))return pending
 const task=colleagueTask(o,me)
 if(task)return {text:brief(task.text),tab:'internal',time:task.time,icon:'ChatLineSquare'}
 if(o.ownerId===me&&Number(o.actionBugCount)>0)return {text:`${o.actionBugCount} 条问题需要你处理`,tab:'bugs',query:'&todo=1',icon:'Warning'}
 // 最近一条动态就是这次的新消息：谁说了什么、谁改了什么
 const e=o.lastEvent
 if(e){
  const said=c=>(!c||c==='（无文字）')?'[图片 / 文件]':brief(c)
  if(e.type==='message')return {text:`客户：${said(e.content)}`,tab:'chat',time:e.time}
  if(e.type==='reply')return {text:`${e.user||'团队'} 回复客户：${said(e.content)}`,tab:'chat',time:e.time}
  if(e.type==='status')return {text:`${e.user||'有人'} 把状态改成${String(e.content||'').replace(/^状态更新为/,'')}`,time:e.time}
  // 建单人不是团队成员，就是客户自己在客户端提交的
  if(e.type==='create')return pending||{text:MEMBERS.some(x=>x.name===e.user)?`${e.user} 新建了这个项目`:`客户${e.user?' '+e.user:''} 提交了新需求`,time:e.time}
  // 内部记录：系统写的那种已经带了名字（「小周 拒绝了这个项目：…」），手写的补上是谁写的
  const c=String(e.content||'')
  return {text:e.user&&c.startsWith(e.user)?brief(c,48):`${e.user||'同事'}：${said(c)}`,tab:'internal',time:e.time}
 }
 const m=o.lastMessage
 if(m){
  const who=m.type==='message'?'客户':(m.user||'团队')+' 回复客户'
  return {text:`${who}：${brief(m.content)||(m.hasAttachments?'[图片 / 文件]':'发来消息')}`,tab:'chat',time:m.time}
 }
 if(pending)return pending
 const parts=['有更新 · 现在'+(statusMap[o.status]?.label||'')]
 if(o.nextStep)parts.push('下一步：'+brief(o.nextStep,24))
 return {text:parts.join(' · ')}
}
const items=computed(()=>{
 const projectItems=orders.filter(o=>o.unread?.includes(currentMember.value.id)||o.assignState==='pending').map(o=>{const l=projectLine(o);return {key:'p'+o.id,title:o.title,text:l.text,time:l.time||o.updateTime,caption:[o.orderNo,friendlyTime(l.time||o.updateTime)].filter(Boolean).join(' · '),path:'/order?id='+o.id+(l.tab?'&tab='+l.tab:'')+(l.query||''),icon:l.icon||'ChatDotRound',unread:!!o.unread?.includes(currentMember.value.id),at:stamp(l.time||o.updateTime)}}).sort((a,b)=>(b.unread-a.unread)||(b.at-a.at))
 const approvalItems=approvals.filter(a=>isBoss.value?a.status==='pending':a.requesterId===currentMember.value.id).map(a=>({key:'a'+a.id,title:a.orderTitle||'项目审批',text:(a.reason||'项目变更申请')+' · '+(labels[a.status]||a.status),caption:isBoss.value?'待我审批':'我的申请',path:'/approvals?id='+a.id,icon:'Finished',unread:a.status==='pending'}))
 const quoteItems=quoteTodos.value.map(q=>({key:'q'+q.id,title:q.title,text:q.replyVersion?'对方在报价单中回复了你':isBoss.value?`${q.employeeName} 已提交报价 ${money(q.amount)}`:`${q.creatorName} 发来了需求，请查看附件并报价`,time:q.updateTime,caption:friendlyTime(q.updateTime),path:'/quotes?id='+q.id+(q.replyVersion?'&tab=chat':''),icon:'PriceTag',unread:isQuoteUnread(q)}))
 return tab.value==='quotes'?quoteItems:tab.value==='projects'?projectItems:tab.value==='approvals'?approvalItems:[...quoteItems,...projectItems,...approvalItems]
})
</script>
