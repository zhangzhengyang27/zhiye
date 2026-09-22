<template>
  <el-container class="min-h-screen">
    <div class="flex h-screen flex-col p-4">
      <h1 class="mb-4 text-xl">语雀编辑器测试</h1>
      <div class="min-h-0 flex-1 border border-line">
        <YuqueDocEditor v-model="content" content-type="markdown" />
      </div>
      <textarea v-model="content" class="mt-4 h-40 w-full border border-line p-2 font-mono text-xs" />
    </div>
  </el-container>
</template>

<script setup lang="ts">
/** 编辑器测试页：直接挂载 YuqueDocEditor，便于联调 Lake 内核与内容同步。 */
import { ref } from "vue"
import YuqueDocEditor from "@/components/editor/YuqueDocEditor.vue"

const content = ref("# 测试\n\n这是一段用于验证语雀编辑器的 Markdown 内容。")
</script>
