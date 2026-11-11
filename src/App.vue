<template>
  <el-config-provider :message="messageOptions" :locale="zhCn">
  <router-view :key="$route.params.id" />
  <FullscreenImage />
  </el-config-provider>
</template>

<script setup>
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { computed } from 'vue'
import { isMobile } from '@/utils/useMobile'
const messageOptions = computed(() => ({
  grouping: true, offset: isMobile.value ? 88 : 16, placement: isMobile.value ? 'bottom' : 'top'
}))
import FullscreenImage from '@/components/FullscreenImage.vue'
</script>
