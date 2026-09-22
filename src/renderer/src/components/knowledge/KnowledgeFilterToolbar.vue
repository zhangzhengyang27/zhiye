<script setup lang="ts">
/** 工具栏组件，负责知识筛选筛选、搜索与快捷操作。 */
import { ChevronDown } from "lucide-vue-next"

const props = defineProps<{
  modelValue: string
  placeholder: string
  filters?: Array<{ label: string; value: string }>
  filterValue?: string
  filterClass?: string
  loading?: boolean
  destructiveLabel?: string
  destructiveDisabled?: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
  "update:filterValue": [value: string]
  refresh: []
  destructive: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2 lg:flex-row lg:items-center">
    <div class="relative max-w-sm flex-1">
      <el-input
        :model-value="props.modelValue"
        type="text"
        :placeholder="props.placeholder"
        class="h-8 w-full pl-8 text-kb-sm"
        @update:model-value="emit('update:modelValue', String($event))"
      />
      <!-- 前缀图标排在控件之后：EP 根 position:relative + 自带填充，写在前头会被盖住 -->
      <AppIcon
        name="i-lucide-search"
        class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-quaternary transition-colors duration-200"
      />
    </div>

    <el-select
      v-if="props.filters?.length"
      :model-value="props.filterValue"
      :options="props.filters"
      :offset="6"
      :show-arrow="false"
      :suffix-icon="ChevronDown"
      class="min-w-45 transition duration-200"
      :class="props.filterClass"
      @update:model-value="emit('update:filterValue', String($event))"
    />

    <div class="flex flex-1 items-center justify-end gap-2">
      <el-button
        v-if="props.destructiveLabel"
        type="danger"
        :disabled="props.destructiveDisabled"
        class="h-8 rounded-kb-md px-3 py-0 gap-1.5 kb-btn-soft"
        @click="emit('destructive')"
        ><AppIcon name="i-lucide-trash-2" class="h-[14px] w-[14px]" />
        <span class="truncate">{{ props.destructiveLabel }}</span>
      </el-button>

      <el-button
        plain
        :disabled="props.loading"
        class="h-8 rounded-kb-md px-3 py-0 gap-1.5"
        @click="emit('refresh')"
        ><AppIcon
          name="i-lucide-refresh-cw"
          class="h-3.5 w-3.5"
          :class="props.loading ? 'animate-spin' : ''"
        />
        <span class="truncate">刷新</span>
      </el-button>
    </div>
  </div>
</template>
