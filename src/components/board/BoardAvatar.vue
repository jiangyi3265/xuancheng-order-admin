<template><span class="board-avatar" tabindex="0" role="button" :aria-label="'放大图片：'+name" @click.stop="openCover($event,name)" @keydown.enter.stop.prevent="openCover($event,name)" :style="{width:size+'px',height:size+'px'}"><img v-if="src" :src="src" :alt="name"/><BoardArtwork v-else :kind="role" label="默认头像"/></span></template>
<script setup>
import { openCover } from '@/utils/imagePreview'
import BoardArtwork from './BoardArtwork.vue'
defineProps({src:String,name:{type:String,default:'头像'},role:{type:String,default:'boss'},size:{type:Number,default:48}})
</script>
<style scoped>.board-avatar{display:inline-flex;border-radius:50%;overflow:hidden;border:2px solid #fff;box-shadow:0 1px 5px #122d5014;flex:none;align-items:center;background:#e9eef5}.board-avatar img,.board-avatar .board-artwork{width:100%;height:100%;object-fit:cover}</style>
