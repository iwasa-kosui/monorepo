<!--
  Usage:

```md
---
layout: two-cols
---

# Left

This shows on the left

::right::

# Right

This shows on the right
```

-->

<script setup lang="ts">
const props = defineProps({
  class: {
    type: String,
  },
  layoutClass: {
    type: String,
  },
})
</script>

<template>
  <div class="slidev-layout two-columns w-full h-full grid grid-cols-2 gap-x-8 gap-y-0" :class="props.layoutClass">
    <div class="col-left" :class="props.class">
      <slot />
    </div>
    <div class="col-right" :class="props.class">
      <slot name="right" />
    </div>
  </div>
</template>

<style>
.two-cols {
  &.two-cols-card {
    .col-left,
    .col-right {
      @apply bg-amber-100 bg-opacity-50 p-4 rounded-lg;
    }
  }
}

.dark .two-cols {
  &.two-cols-card {
    .col-left,
    .col-right {
      @apply bg-amber-900 text-white;
    }
  }
}
</style>
