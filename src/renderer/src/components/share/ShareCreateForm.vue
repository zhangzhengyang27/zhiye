<script setup lang="ts">
/** 表单组件，负责分享创建输入校验与提交。 */

interface PermissionOption {
  label: string
  value: "view" | "edit"
  description: string
}

interface ExpiryOption {
  label: string
  value: "never" | "1day" | "7days" | "30days"
}

defineProps<{
  permissionOptions: PermissionOption[]
  expiryOptions: ExpiryOption[]
  permission: "view" | "edit"
  usePassword: boolean
  password: string
  expiresIn: "never" | "1day" | "7days" | "30days"
  allowEditPermission?: boolean
  creationSummary: string
  latestShareCreatedAt: string
  shareTips: string[]
}>()

const emit = defineEmits<{
  "update:permission": [value: "view" | "edit"]
  "update:usePassword": [value: boolean]
  "update:password": [value: string]
  "update:expiresIn": [value: "never" | "1day" | "7days" | "30days"]
}>()
</script>

<!-- TODO(nuxt-ui-migration): 原 URadioGroup variant="card"（卡片式选项）与 USwitch 卡片行 :ui 深度定制
     在 EP 原生组件中无对应能力：权限组用 el-radio-group + el-radio list 形态（保留 description），
     有效期组用 el-segmented 分段控件，卡片外观随新组件标准化。开关行整体（轨道 + 图标 + 文案）为
     label 包裹的整行可点结构：点击文案经 label 原生关联落到隐藏 input（冒泡进 el-switch 根，
     EP 的 prevent 吞掉二次默认行为）；Space 由 keydown 补齐（role=switch 的 input 无原生空格激活）。 -->
<template>
  <div class="space-y-5">
    <!-- 原 UCard + :ui 定制（root/header/body），替换为普通 div 结构（样式等价）。
         容器底色不取 bg-muted：里面的 el-input 填充就是 --kb-muted-bg（同 token 会隐形），
         分组改由描边与抬升面承担 -->
    <div class="rounded-kb-3xl border border-line bg-surface">
      <div class="px-5 pt-5 pb-0">
        <div>
          <p class="text-sm font-semibold text-ink-secondary">新建分享配置</p>
          <p class="mt-1 text-[12px] leading-5 text-ink-quaternary">先定义权限边界，再生成对外链接。</p>
        </div>
      </div>

      <div class="space-y-4 px-5 py-5">
        <div>
          <label class="mb-2 block text-[12px] font-medium text-ink-tertiary">权限</label>
          <el-radio-group
            :model-value="permission"
            :class="permissionOptions.length > 1 ? 'flex-row items-center gap-5' : 'gap-3'"
            @update:model-value="emit('update:permission', $event as 'view' | 'edit')"
          >
            <el-radio v-for="item in permissionOptions" :key="item.value" :value="item.value">
              <span class="block text-sm font-medium text-ink">{{ item.label }}</span>
              <span v-if="item.description" class="mt-0.5 block text-xs text-ink-tertiary">{{ item.description }}</span>
            </el-radio>
          </el-radio-group>
          <p v-if="allowEditPermission === false" class="mt-2 text-[11px] leading-5 text-ink-quaternary">
            当前文档只开放只读分享，避免在公共链接中出现未收敛的编辑行为。
          </p>
        </div>

        <div>
          <div
            class="rounded-kb-2xl border px-4 py-3 transition"
            :class="
              usePassword ? 'border-warning-light bg-warning-bg' : 'border-line bg-surface hover:border-brand-lighter'
            "
          >
            <label
              class="flex w-full cursor-pointer items-center gap-3 rounded-kb-md text-left outline-none transition"
              @keydown.space.prevent="emit('update:usePassword', !usePassword)"
            >
              <span class="relative inline-flex shrink-0 items-center">
                <el-switch
                  :model-value="usePassword"
                  @update:model-value="emit('update:usePassword', Boolean($event))"
                />
                <AppIcon
                  name="i-lucide-check"
                  class="absolute left-1 h-3.5 w-3.5 text-white"
                  :class="usePassword ? 'opacity-100' : 'opacity-0'"
                />
                <AppIcon
                  name="i-lucide-x"
                  class="absolute right-1 h-3.5 w-3.5 text-white"
                  :class="usePassword ? 'opacity-0' : 'opacity-100'"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-medium text-ink">访问密码</span>
                <span class="mt-0.5 block text-xs text-ink-tertiary">
                  {{ usePassword ? "已开启密码访问，需要同时分发密码。" : "关闭后，拿到链接即可直接访问。" }}
                </span>
              </span>
            </label>
          </div>

          <el-input
            v-if="usePassword"
            :model-value="password"
            type="text"
            placeholder="输入至少 4 位访问密码"
            class="mt-3"
            @update:model-value="emit('update:password', $event)"
          />
        </div>

        <div>
          <label class="mb-2 block text-[12px] font-medium text-ink-tertiary">有效期</label>
          <el-segmented
            :model-value="expiresIn"
            :options="expiryOptions"
            @update:model-value="emit('update:expiresIn', $event as 'never' | '1day' | '7days' | '30days')"
          >
            <template #default="{ item }">
              <AppIcon
                v-if="(item as ExpiryOption).value === expiresIn"
                name="i-lucide-check"
                class="h-3.5 w-3.5 text-success"
              />
              {{ (item as ExpiryOption).label }}
            </template>
          </el-segmented>
        </div>

        <div class="rounded-kb-3xl bg-surface px-4 py-4">
          <p class="text-[12px] font-medium text-ink-tertiary">当前配置摘要</p>
          <p class="mt-2 text-[14px] font-semibold text-ink-secondary">{{ creationSummary }}</p>
          <p class="mt-2 text-[12px] leading-6 text-ink-tertiary">{{ latestShareCreatedAt }}</p>
        </div>
      </div>
    </div>

    <!-- 原 UCard + :ui 定制（root/header/body），替换为普通 div 结构（样式等价） -->
    <div class="rounded-kb-3xl border border-line bg-surface">
      <div class="px-5 pt-5 pb-0">
        <div>
          <p class="text-sm font-semibold text-ink-secondary">分发建议</p>
          <p class="mt-1 text-[12px] leading-5 text-ink-quaternary">根据当前配置给出更稳妥的分享建议。</p>
        </div>
      </div>

      <div class="space-y-2 px-5 py-5">
        <div
          v-for="tip in shareTips"
          :key="tip"
          class="rounded-kb-2xl bg-muted px-4 py-3 text-[12px] leading-6 text-ink-tertiary"
        >
          {{ tip }}
        </div>
      </div>
    </div>
  </div>
</template>
