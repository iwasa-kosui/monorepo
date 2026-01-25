<script setup lang="ts">
import CardBase from './CardBase.vue'
import CardBadge from './CardBadge.vue'
import CardHeader from './CardHeader.vue'
import CardContent from './CardContent.vue'

defineProps<{
  number: number | string
  title: string
  description?: string
  variant?: 'primary' | 'secondary'
}>()
</script>

<template>
  <CardBase variant="primary" padding="lg">
    <CardHeader gap="md">
      <template #badge>
        <CardBadge :value="number" size="lg" :variant="variant || 'primary'" />
      </template>
      <template #title>
        <span>{{ title }}</span>
      </template>
    </CardHeader>
    <CardContent :description="description">
      <slot />
    </CardContent>
  </CardBase>
</template>
