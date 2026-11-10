<template>
  <div class="customer-portal">
    <aside v-if="!isMobile || !route.params.id" class="portal-navigation">
      <router-link v-if="!isMobile" to="/projects" class="portal-brand">
        <BrandLogo /><span>玄成接单<small>客户中心</small></span>
      </router-link>
      <AppTabBar :active="route.meta.customerTab" :single-project="orders.length===1" />
      <router-link v-if="!isMobile" to="/customer/mine" class="portal-account">
        <el-icon aria-hidden="true"><User /></el-icon>
        <span>{{ customerName || '我的账号' }}</span>
      </router-link>
    </aside>
    <div class="portal-content"><router-view /></div>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import BrandLogo from '@/components/board/BrandLogo.vue'
import AppTabBar from '@/customer/components/AppTabBar.vue'
import { customerName } from '@/customer/mock/store'
import { isMobile } from '@/utils/useMobile'

import { provideCustomerOrders } from '@/customer/utils/useCustomerOrders'

const route = useRoute()
const { orders } = provideCustomerOrders()
</script>

<style scoped>
@media (min-width: 769px) {
  .customer-portal {
    display: grid;
    grid-template-columns: clamp(174px, 16vw, 224px) minmax(0, 1fr);
    min-height: 100dvh;
    background: #f5f7fc;
  }
  .portal-navigation {
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 30px 16px 18px;
    background: #fff;
    border-right: 1px solid #dfe6f2;
  }
  .portal-brand, .portal-account { display: flex; align-items: center; gap: 11px; color: #17294b; }
  .portal-brand { margin: 0 6px 40px; font-size: 19px; font-weight: 700; }
  .portal-brand small { display: block; margin-top: 4px; color: #66758b; font-size: 12px; font-weight: 400; }
  .portal-account { margin-top: auto; padding: 18px 10px 0; border-top: 1px solid #e7edf5; font-size: 14px; }
  .portal-account .el-icon { background: #eaf1ff; color: #245ad1; padding: 8px; border-radius: 50%; box-sizing: content-box; flex: none; }
  .portal-account span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .portal-content { min-width: 0; }
  .portal-content :deep(.customer-shell) { min-height: 100dvh; padding: 38px clamp(24px, 4vw, 64px); background: transparent; }
}
</style>
