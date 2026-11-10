<template><MediaThumb :item="item" :size="size" :gallery="gallery" :siblings="siblings" :removable="removable" @remove="$emit('remove')" /></template>
<script setup>
import MediaThumb from '@/components/MediaThumb.vue'
defineProps({gallery:Array,siblings:Array,item:{type:Object,required:true},size:{type:Number,default:84},removable:{type:Boolean,default:false}})
defineEmits(['remove'])
</script>
