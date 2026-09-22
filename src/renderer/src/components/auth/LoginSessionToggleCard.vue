<script setup lang="ts">
/** 切换卡片组件，负责登录会话状态切换与说明展示。 */
const props = defineProps<{
  title: string
  description: string
  modelValue: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()
</script>

<template>
  <div
    class="flex cursor-pointer items-center justify-between rounded-[18px] border px-4 py-3 text-left transition"
    :class="props.modelValue ? 'border-brand-lighter bg-brand-faint' : 'border-line bg-muted hover:border-brand-lighter'"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span>
      <span class="block text-[13px] font-medium text-ink-secondary">{{ props.title }}</span>
      <span class="mt-1 block text-[11px] leading-5 text-ink-tertiary">{{ props.description }}</span>
    </span>
    <div @click.stop>
      <!-- TODO(nuxt-ui-migration): 原 USwitch color="success" 为品牌绿轨道；AppSwitch 无 color prop，轨道固定 brand 绿，视觉一致 -->
      <AppSwitch
        :model-value="props.modelValue"
        class="w-auto shrink-0"
        checked-icon="i-lucide-check"
        unchecked-icon="i-lucide-x"
        @update:model-value="emit('update:modelValue', Boolean($event))"
      />
    </div>
  </div>
</template>
