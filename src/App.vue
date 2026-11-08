<template>
  <router-view :key="$route.params.id" />
  <FullscreenImage />
</template>

<script setup>
import FullscreenImage from '@/components/FullscreenImage.vue'
</script>
