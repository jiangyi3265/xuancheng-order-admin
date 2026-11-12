<template>
  <nav class="handoff-tabs" :aria-label="label">
    <button v-for="tab in tabs" :key="tab.key" type="button" :class="tab.key" :aria-pressed="active === tab.key"
      @click="$emit('select', tab.key)">
      <span>{{ tab.label }}</span> <b>{{ tab.count }}</b>
    </button>
  </nav>
</template>
<script setup>
defineProps({ tabs: { type: Array, required: true }, active: String, label: String })
defineEmits(['select'])
</script>
<style scoped>
.handoff-tabs {display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.handoff-tabs button {--ink:#475569;--tint:#eef2f7;display:inline-flex;gap:9px;align-items:center;justify-content:space-between;
  min-height:38px;padding:5px 11px;color:var(--ink);background:#fff;border:1px solid #d8e1ed;border-radius:9px;line-height:1.3;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer}
.handoff-tabs .review {--ink:#924600;--tint:#fff1dc}
.handoff-tabs .mine {--ink:#174da3;--tint:#eaf2ff}
.handoff-tabs b {display:grid;place-items:center;min-width:24px;height:24px;padding:0 4px;box-sizing:border-box;border-radius:6px;
  color:var(--ink);background:var(--tint);font-size:14px;font-variant-numeric:tabular-nums}
.handoff-tabs [aria-pressed=true] {background:var(--tint);border-color:var(--ink);box-shadow:inset 0 -2px var(--ink)}
.handoff-tabs [aria-pressed=true] b {color:#fff;background:var(--ink)}
.handoff-tabs button:focus-visible {outline:2px solid #2563eb;outline-offset:2px}
@media(max-width:600px){.handoff-tabs {gap:5px}.handoff-tabs button {min-height:44px;padding:5px 7px}}
</style>
