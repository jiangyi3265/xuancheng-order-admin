<template><nav class="mobile-nav customer-nav" aria-label="客户导航"><router-link v-for="item in items" :key="item.key" :to="item.path" :class="{ selected: active === item.key }"><el-icon><component :is="active===item.key && item.icon==='House'?'HomeFilled':active===item.key && item.icon==='User'?'UserFilled':item.icon" /></el-icon><span>{{ item.label }}</span></router-link></nav></template>
<script setup>
defineProps({ active: {type:String, default:'projects'} })
const items = [{key:'projects',path:'/projects',label:'我的项目',icon:'House'},{key:'intake',path:'/intake',label:'提交需求',icon:'DocumentAdd'},{key:'messages',path:'/customer/messages',label:'消息',icon:'ChatDotRound'},{key:'mine',path:'/customer/mine',label:'我的',icon:'User'}]
</script>