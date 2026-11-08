<template><svg class="xc-logo" viewBox="0 0 40 40" aria-label="玄成接单"><defs><linearGradient :id="id" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#67c4ff"/><stop offset=".55" stop-color="#1765ff"/><stop offset="1" stop-color="#003bff"/></linearGradient></defs><rect width="40" height="40" rx="10" :fill="`url(#${id})`"/><path d="M8 8h11l14 24H22z" fill="#fff" fill-opacity=".75"/><path d="M21 8h12L18 32H7z" fill="#fff" fill-opacity=".95"/><path d="M15 20l5-8 5 8-5 8z" fill="#85c6ff" fill-opacity=".72"/></svg></template>
<script setup>
import {useId} from 'vue'
const id='xc-logo-'+useId()
</script>
<style scoped>.xc-logo{width:38px;height:38px;flex:none;filter:drop-shadow(0 3px 5px #165dff22)}</style>
