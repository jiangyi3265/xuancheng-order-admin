<template>
  <div class="profile-page" :class="{'customer-shell':customer}">
    <header class="profile-hero"><BoardAvatar :size="64" :role="customer?'customer':isBoss?'boss':'employee'"/><div><h1>{{ name }}</h1><p>{{ customer ? '每一份需求，都有回应' : '项目有序推进，协作更简单' }}</p></div><el-icon><ArrowRight /></el-icon></header>
    <section class="menu-group"><button v-for="item in links" :key="item.path" @click="router.push(item.path)"><span class="menu-symbol"><el-icon><component :is="item.icon" /></el-icon></span><span>{{ item.label }}</span><el-icon><ArrowRight /></el-icon></button></section>
    <section class="menu-group"><button @click="router.push(customer ? '/customer/security' : '/security')"><span class="menu-symbol"><el-icon><Lock /></el-icon></span><span>账号与安全</span><el-icon><ArrowRight /></el-icon></button><button v-if="!customer" @click="router.push('/settings')"><span class="menu-symbol"><el-icon><Bell /></el-icon></span><span>通知与提醒</span><el-icon><ArrowRight /></el-icon></button></section>

    <el-button class="logout-button" type="danger" plain @click="exit">退出登录</el-button>
  </div>
</template>
<script setup>
import BoardAvatar from '@/components/board/BoardAvatar.vue'
import { toast as ElMessage } from '@/utils/toast'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentMember, isBoss, customerName, signOutDevice } from '@/mock/store'
const route=useRoute(), router=useRouter()
const customer=computed(()=>!!route.meta.customer)
const name=computed(()=>customer.value ? customerName.value || '客户' : currentMember.value.name)
const links=computed(()=>customer.value ? [{path:'/projects',label:'我的项目',icon:'FolderOpened'},{path:'/intake',label:'提交新需求',icon:'DocumentAdd'},{path:'/customer/messages',label:'我的消息',icon:'ChatDotRound'}] : [
{path:'/quotes',label:'报价中心',icon:'PriceTag'},
{path:'/customers',label:'客户账号',icon:'User'},
...(isBoss.value ? [{path:'/staff',label:'成员管理',icon:'UserFilled'},{path:'/dashboard',label:'数据统计',icon:'DataLine'}] : []),
{path:'/trash',label:'回收站',icon:'Delete'},
...(isBoss.value ? [{path:'/audit',label:'操作日志',icon:'Document'}] : [])])
async function exit(){
  try {await signOutDevice();router.replace('/login')}
  catch(e){ElMessage.error(e.message || '退出未完成，请重试')}
}
</script>
