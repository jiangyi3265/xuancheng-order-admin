<template><div class="customer-shell inbox-page"><div class="page-heading"><div><h1>消息中心</h1><p>与团队保持沟通，让需求顺利交付</p></div><el-button :loading="loading" @click="load">刷新</el-button></div><el-alert v-if="error" :title="error" type="error" :closable="false"/><div class="message-list" v-loading="loading"><button v-for="o in sorted" :key="o.id" class="message-card" @click="router.push('/projects/'+o.id+'?tab=chat')"><span class="message-symbol"><el-icon><ChatDotRound /></el-icon></span><div><strong>{{ o.title }}</strong><p>{{ lastText(o) }}</p><span class="muted">{{ o.lastMessage?.time ? String(o.lastMessage.time).slice(5, 16) + ' · ' : '' }}{{ o.messageCount || 0 }} 条沟通</span></div><i v-if="hasNewReply(o)" class="unread-dot" aria-hidden="true" title="团队有新回复"></i><el-icon><ArrowRight /></el-icon></button></div><el-empty v-if="!loading&&!items.length&&!error" description="暂无项目消息"/><AppTabBar active="messages"/></div></template>
<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {useRouter} from 'vue-router'
import {listMyOrders} from '@/customer/mock/store'
import AppTabBar from '@/customer/components/AppTabBar.vue'
import {computed} from 'vue'
import {hasNewReply} from '@/customer/utils/seen'
// 写清是谁说的；团队有新回复的排最前，其余按最近沟通时间
const lastText=o=>{const m=o.lastMessage;if(!m)return '打开项目，开始沟通';const who=m.type==='message'?'我':'团队';return who+'：'+(m.content||(m.hasAttachments?'[图片 / 文件]':''))}
const sorted=computed(()=>[...items.value].sort((a,b)=>(hasNewReply(b)-hasNewReply(a))||String(b.lastMessage?.time||'').localeCompare(String(a.lastMessage?.time||''))))
const router=useRouter(),items=ref([]),loading=ref(false),error=ref('');let poller
async function load(){if(loading.value)return;loading.value=true;error.value='';try{items.value=await listMyOrders()||[]}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(()=>{load();poller=setInterval(()=>{if(!document.hidden)load()},15000)})
onBeforeUnmount(()=>clearInterval(poller))
</script>
