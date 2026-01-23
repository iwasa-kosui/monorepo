<script setup lang="ts">
/**
 * NumberedCard - 番号付きカードコンポーネント
 * 方法論の全体像、まとめなどで使用
 */
defineProps<{
  /** カードの番号 */
  number: number
  /** カードのタイトル */
  title: string
  /** カラーバリアント */
  variant?: 'primary' | 'success' | 'warning' | 'accent'
}>()

const variantClasses = {
  primary: {
    bg: 'bg-brand-50',
    badge: 'bg-brand-500',
  },
  success: {
    bg: 'bg-emerald-50',
    badge: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-amber-50',
    badge: 'bg-amber-500',
  },
  accent: {
    bg: 'bg-purple-50',
    badge: 'bg-purple-500',
  },
}
</script>

<template>
  <div
    class="p-5 rounded-lg"
    :class="variantClasses[variant ?? 'primary'].bg"
  >
    <div class="flex items-center gap-3 mb-2">
      <div
        class="w-8 h-8 text-white rounded-full flex items-center justify-center font-bold"
        :class="variantClasses[variant ?? 'primary'].badge"
      >
        {{ number }}
      </div>
      <h3 class="font-bold">{{ title }}</h3>
    </div>
    <p class="text-sm text-slate-600">
      <slot />
    </p>
  </div>
</template>
