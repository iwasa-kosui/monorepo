<script setup lang="ts">
import CardBase from './CardBase.vue'
import CardBadge from './CardBadge.vue'
import CardHeader from './CardHeader.vue'
import CardContent from './CardContent.vue'

defineProps<{
  number: number | string
  title: string
  description?: string
  subdescription?: string
  variant?: 'primary' | 'secondary'
  size?: 'normal' | 'small'
}>()
</script>

<template>
  <CardBase variant="primary" padding="lg">
    <CardHeader gap="sm">
      <template #badge>
        <CardBadge
          :value="number"
          :size="size === 'small' ? 'sm' : 'md'"
          :variant="variant || 'primary'"
        />
      </template>
      <template #title>
        <span>{{ title }}</span>
      </template>
    </CardHeader>
    <CardContent :description="description" :subdescription="subdescription">
      <slot />
    </CardContent>
  </CardBase>
</template>
