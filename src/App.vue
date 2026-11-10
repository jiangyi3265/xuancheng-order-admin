<template>
  <el-config-provider :message="messageOptions">
  <router-view :key="$route.params.id" />
  <FullscreenImage />
  </el-config-provider>
</template>

<script setup>
import { computed } from 'vue'
import { isMobile } from '@/utils/useMobile'
const messageOptions = computed(() => ({
  grouping: true, offset: isMobile.value ? 88 : 16, placement: isMobile.value ? 'bottom' : 'top'
}))
import FullscreenImage from '@/components/FullscreenImage.vue'
</script>
