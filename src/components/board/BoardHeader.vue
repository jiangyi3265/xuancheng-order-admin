<template><header class="board-header" :class="{'is-brand':brand}"><button v-if="back" class="icon-button" aria-label="返回" @click="$emit('back')"><el-icon><ArrowLeft/></el-icon></button><BrandLogo v-if="brand"/><div><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div><slot/><button v-if="bell" class="icon-button header-bell" aria-label="消息中心" @click="$emit('bell')"><el-icon><Bell/></el-icon></button></header></template>
<script setup>
import BrandLogo from './BrandLogo.vue'
defineProps({title:String,subtitle:String,brand:Boolean,back:Boolean,bell:Boolean})
defineEmits(['back','bell'])
</script>
<style scoped>.board-header{display:flex;align-items:center;gap:12px;padding:22px 20px;min-height:76px}.board-header h1{font-size:20px;line-height:1.3;margin:0;font-weight:750;color:#0c1730}.board-header p{margin:6px 0 0;font-size:12px;color:#727e96;line-height:1.5}.board-header>div{flex:1;min-width:0}.header-bell{margin-left:auto}.icon-button{padding:4px;border:0;background:none;color:#17253f;display:inline-flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer}</style>
