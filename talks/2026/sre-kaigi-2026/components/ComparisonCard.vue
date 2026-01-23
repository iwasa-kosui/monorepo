<script setup lang="ts">
/**
 * ComparisonCard - 比較カードコンポーネント
 * 採用/不採用の比較で使用
 */
defineProps<{
  /** カードのタイトル */
  title: string
  /** ステータス: adopted=採用, rejected=不採用, neutral=中立 */
  status?: 'adopted' | 'rejected' | 'neutral'
  /** ステータステキスト（カスタム） */
  statusText?: string
  /** タイトルのフォントサイズ（デフォルト: base） */
  titleSize?: 'sm' | 'base'
}>()

const statusClasses = {
  adopted: {
    container: 'bg-emerald-50 border-2 border-emerald-400',
    text: 'text-emerald-600',
    icon: '✓',
  },
  rejected: {
    container: 'bg-red-50',
    text: 'text-red-600',
    icon: '✗',
  },
  neutral: {
    container: 'bg-slate-50',
    text: 'text-slate-600',
    icon: '',
  },
}
</script>

<template>
  <div
    class="p-4 rounded-lg"
    :class="statusClasses[status ?? 'neutral'].container"
  >
    <h4
      class="font-bold mb-2"
      :class="titleSize === 'sm' ? 'text-sm' : ''"
    >
      {{ title }}
    </h4>
    <div class="text-xs text-slate-600">
      <slot />
    </div>
    <p
      v-if="statusText || status === 'adopted' || status === 'rejected'"
      class="text-xs mt-2 font-bold"
      :class="statusClasses[status ?? 'neutral'].text"
    >
      {{ statusClasses[status ?? 'neutral'].icon }}
      {{ statusText ?? (status === 'adopted' ? '採用' : status === 'rejected' ? '不採用' : '') }}
    </p>
  </div>
</template>
