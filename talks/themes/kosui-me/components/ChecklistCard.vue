<script setup lang="ts">
import CardBase from './CardBase.vue'
import CardContent from './CardContent.vue'

defineProps<{
  title: string
}>()
</script>

<template>
  <CardBase variant="neutral" padding="sm">
    <CardContent :title="title" titleSize="sm">
      <slot />
    </CardContent>
  </CardBase>
</template>

<style scoped>
:deep(.title) {
  @apply mb-1;
}
</style>
