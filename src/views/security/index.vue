<template><div class="security-page" :class="{'customer-shell':customer}">
  <div class="page-heading"><el-button circle :icon="ArrowLeft" @click="router.push(customer ? '/customer/mine' : '/mine')"/><h1>账号安全</h1></div>
  <header class="profile-hero"><BoardAvatar :size="54" :role="customer?'customer':isBoss?'boss':'employee'"/><div><h2>{{ name }}</h2><p>{{ customer ? '客户账号' : '团队成员账号' }}</p></div><el-icon><Lock /></el-icon></header>
  <section class="surface"><h2><el-icon><Lock /></el-icon> 修改密码</h2><el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
    <el-form-item label="当前密码" prop="oldPassword"><el-input v-model="form.oldPassword" type="password" show-password autocomplete="current-password" /></el-form-item>
    <el-form-item label="新密码" prop="newPassword"><el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" /></el-form-item>
    <el-form-item label="确认新密码" prop="confirm"><el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" /></el-form-item>
    <p class="muted">新密码为 5–20 位，不能与原密码或账号相同。</p><el-button type="primary" native-type="submit" :loading="saving" class="wide-button">保存修改</el-button>
  </el-form></section><el-alert title="修改密码后，其他设备需要重新登录。" type="info" :closable="false" show-icon />
</div></template>
<script setup>
import BoardAvatar from '@/components/board/BoardAvatar.vue'
import {ref,reactive,computed} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ArrowLeft} from '@element-plus/icons-vue'
import {ElMessage} from 'element-plus'
import {currentMember,customerName,changeMyPassword,isBoss} from '@/mock/store'
import {changeMyPassword as changeCustomerPassword} from '@/customer/mock/store'
const route=useRoute(),router=useRouter(),formRef=ref(),saving=ref(false)
const customer=computed(()=>!!route.meta.customer),name=computed(()=>customer.value?customerName.value:currentMember.value.name)
const form=reactive({oldPassword:'',newPassword:'',confirm:''})
const rules={oldPassword:[{required:true,message:'请输入当前密码',trigger:'blur'}],newPassword:[{required:true,message:'请输入新密码',trigger:'blur'},{min:5,max:20,message:'密码需为5–20位',trigger:'blur'}],confirm:[{required:true,message:'请确认新密码',trigger:'blur'},{validator:(_,value,cb)=>value===form.newPassword?cb():cb(new Error('两次密码不一致')),trigger:'blur'}]}
async function submit(){if(saving.value)return; if(!await formRef.value.validate().catch(()=>false))return;saving.value=true;try{await (customer.value?changeCustomerPassword:changeMyPassword)(form.oldPassword,form.newPassword);ElMessage.success('密码已修改');Object.assign(form,{oldPassword:'',newPassword:'',confirm:''});formRef.value.clearValidate()}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
</script>
