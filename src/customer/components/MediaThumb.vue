<template><MediaThumb :item="item" :size="size" :removable="removable" @remove="$emit('remove')" /></template>
<script setup>
import MediaThumb from '@/components/MediaThumb.vue'
defineProps({item:{type:Object,required:true},size:{type:Number,default:84},removable:{type:Boolean,default:false}})
defineEmits(['remove'])
</script>
