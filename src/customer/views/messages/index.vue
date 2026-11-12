<template>
  <div class="customer-shell inbox-page">
    <header class="page-heading">
      <h1>消息中心</h1>
      <el-button :loading="refreshing" @click="load">刷新</el-button>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-loading="loading" class="message-list">
      <router-link v-for="message in entries" :key="message.key" class="message-card" :to="message.to">
        <span class="message-symbol"><el-icon><component :is="message.kind==='chat' ? ChatDotRound : Document" /></el-icon></span>
        <div class="message-body">
          <strong>{{ message.title }} <small v-if="message.kind==='review'" class="review-label">等你确认</small></strong>
          <p>{{ message.content }}</p>
          <span class="muted" :title="fmtTime(message.time)">{{ message.meta }}</span>
        </div>
        <i v-if="message.unread" class="unread-dot" aria-label="未读" title="有新回复"></i>
        <el-icon aria-hidden="true"><ArrowRight /></el-icon>
      </router-link>
    </div>
    <el-empty v-if="!loading&&!entries.length&&!error" description="暂无项目消息" />
  </div>
</template>

<script setup>
import { fmtTime } from '@/utils/time'
import { computed, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { ArrowRight, ChatDotRound, Document } from '@element-plus/icons-vue'
import { useCustomerOrders } from '@/customer/utils/useCustomerOrders'
import { hasNewReply } from '@/customer/utils/seen'
import { issueRoute, reviewRoute, replyText, replyTime } from '@/customer/utils/requirementReplies'

const { orders, loading, refreshing, error, load } = useCustomerOrders()
const route = useRoute()
const account = localStorage.getItem('customerAccount')
const saved = history.state?.customerInbox
let restoreTop = account && saved?.account === account ? saved.top : null

onBeforeRouteLeave(to => {
  if (!account || !to.params.id || history.state?.current !== route.fullPath) return
  history.replaceState({...history.state, customerInbox:{account, top:window.scrollY}}, '')
})
const entries = computed(() => {
  const rows = []
  for (const project of orders.value) {
    const last = project.lastMessage
    rows.push({
      key:'chat-'+project.id, kind:'chat', title:project.title, unread:hasNewReply(project), time:last?.time || '',
      content:last ? (last.type==='message' ? (last.mine === false ? (last.user || '客户') + '：' : '我：') : '团队：') + replyText(last) : '打开项目，开始沟通',
      meta:[replyTime(last?.time),(project.messageCount || 0)+' 条沟通'].filter(Boolean).join(' · '),
      to:{path:'/projects/'+project.id,query:{tab:'chat'}}
    })
    for (const item of project.requirements || []) {
      const reply = item.latestTeamReply
      if (item.status === 'confirm' && item.reviewId) {
        const sameReply = !!reply && String(reply.id) === String(item.reviewId)
        rows.push({
          key:'review-'+item.reviewId, kind:'review', title:item.title || '附件需求',
          unread:sameReply && reply.unread, time:item.reviewTime || '',
          // 写上是谁发来的（团队成员的名字；AI 改完的署名是项目负责人）
          content:sameReply && reply.content ? (reply.by ? reply.by + '：' : '') + reply.content : '查看本次修改',
          meta:[project.title,'需求 #'+item.id,replyTime(item.reviewTime)].filter(Boolean).join(' · '),
          to:reviewRoute(project,item)
        })
        if (sameReply) continue
      }
      if (!reply?.id) continue
      rows.push({
        key:'issue-'+project.id+'-'+item.id, kind:'issue', title:item.title || '附件需求',
        unread:!!reply.unread, time:reply.time || '', content:(reply.by || '团队')+'：'+replyText(reply),
        meta:[project.title,'需求 #'+item.id,replyTime(reply.time)].filter(Boolean).join(' · '),
        to:issueRoute(project,item,reply.id)
      })
    }
  }
  return rows.sort((a,b) => {
    const reviewA = a.kind === 'review'
    const reviewB = b.kind === 'review'
    if (reviewA !== reviewB) return reviewA ? -1 : 1
    const byTime = b.time.localeCompare(a.time)
    return reviewA ? byTime : Number(!!b.unread) - Number(!!a.unread) || byTime
  })
})

// Project details remount the portal. Wait until the rows have height before restoring the viewport.
watch([loading, entries], () => {
  if (restoreTop == null || loading.value || !entries.value.length) return
  window.scrollTo(0, restoreTop)
  restoreTop = null
}, {flush:'post'})
</script>

<style scoped>
.inbox-page .page-heading {display:flex;align-items:center;justify-content:space-between;gap:12px}
.message-card {text-decoration:none}.message-card:focus-visible {outline:2px solid #457ed7;outline-offset:1px}
.message-body {flex:1;min-width:0}.message-body strong,.message-body .muted {overflow-wrap:anywhere}
.message-body p {overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.review-label {display:inline-block;margin-left:4px;padding:2px 7px;border-radius:6px;color:#84500b;background:#fff1d4;font-size:12px;white-space:nowrap}
</style>
