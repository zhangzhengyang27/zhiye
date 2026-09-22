<script setup lang="ts">
/**
 * 「代理设置」分组（语雀的 `60052` 模块）。
 *
 * 结构照抄：启用代理开关 → （启用后）代理模式 → （HTTP 模式下）代理协议 → 代理服务器行 +
 * 「修改」拉起「设置代理地址」弹窗。语雀另有 `scene==="mini"` 的迷你形态（小记窗口内嵌），
 * 本仓无小记独立窗口，故只实现常规形态。
 *
 * 前端校验只挡明显非法的地址（避免把怪串发给主进程），主进程侧另有一份独立校验。
 */
import { computed, ref } from "vue"
import KbDialogHeader from "@/components/common/KbDialogHeader.vue"
import { useDialogBehavior } from "@/composables/use-dialog-behavior"
import { PROXY_MODE_OPTIONS, PROXY_TYPE_OPTIONS } from "@/constants/desktop-settings"
import { useDesktopSettings } from "@/composables/useDesktopSettings"

/** 与主进程 PROXY_URL_PATTERN 同口径：协议://主机[:端口]，协议限定三种。 */
const PROXY_URL_PATTERN = /^(https?|socks4|socks5):\/\/[A-Za-z0-9._-]+(:\d{1,5})?(\/\S*)?$/i

const { settings, desktopFeaturesUnavailable, setProxy } = useDesktopSettings()

const urlDialogOpen = ref(false)
const draftUrl = ref("")
const errorMessage = ref("")

const proxy = computed(() => settings.proxy)
const isHttpMode = computed(() => proxy.value.mode === "HTTP")

const openUrlDialog = () => {
  draftUrl.value = proxy.value.url
  errorMessage.value = ""
  urlDialogOpen.value = true
}

const handleEnableChange = (value: string | number | boolean) => {
  void setProxy({ ...proxy.value, enable: value === true })
}

const handleModeChange = (value: string | number | boolean) => {
  void setProxy({ ...proxy.value, mode: value === "PAC" ? "PAC" : "HTTP" })
}

const handleProtocolChange = (value: string | number | boolean) => {
  const type = String(value)
  void setProxy({
    ...proxy.value,
    type: type === "SOCKS4" || type === "SOCKS5" ? type : "HTTP",
  })
}

const commitUrl = async () => {
  const url = draftUrl.value.trim()

  if (url && !PROXY_URL_PATTERN.test(url)) {
    errorMessage.value = "代理地址输入错误"
    return
  }

  const ok = await setProxy({ ...proxy.value, url })
  if (!ok) {
    errorMessage.value = "代理地址输入错误"
    return
  }

  urlDialogOpen.value = false
}

const dialog = useDialogBehavior({ open: () => urlDialogOpen.value })
</script>

<template>
  <div class="kb-proxy-wrapper">
    <h2>代理设置</h2>

    <div class="kb-proxy-group">
      <div class="kb-settings-row">
        <span class="kb-proxy-title">启用代理</span>
        <span class="kb-proxy-switcher">
          <el-switch
            class="kb-settings-switch"
            :model-value="proxy.enable"
            :disabled="desktopFeaturesUnavailable"
            @update:model-value="handleEnableChange"
          />
        </span>
      </div>
    </div>

    <template v-if="proxy.enable">
      <div class="kb-proxy-group">
        <div class="kb-settings-row">
          <span class="kb-proxy-title">代理模式</span>
          <el-select
            class="kb-settings-select"
            :model-value="proxy.mode"
            :disabled="desktopFeaturesUnavailable"
            @update:model-value="handleModeChange"
          >
            <el-option
              v-for="option in PROXY_MODE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </div>
      </div>

      <div v-if="isHttpMode" class="kb-proxy-group">
        <div class="kb-settings-row">
          <span class="kb-proxy-title">代理协议</span>
          <el-select
            class="kb-settings-select"
            :model-value="proxy.type"
            :disabled="desktopFeaturesUnavailable"
            @update:model-value="handleProtocolChange"
          >
            <!-- 语雀此处直接显示枚举值，没有中文翻译，保持原样 -->
            <el-option v-for="type in PROXY_TYPE_OPTIONS" :key="type" :label="type" :value="type" />
          </el-select>
        </div>
      </div>

      <div class="kb-proxy-group">
        <div class="kb-settings-row">
          <span class="kb-proxy-title">
            代理服务器
            <span v-if="proxy.url" class="kb-proxy-info text-ink-tertiary">{{ proxy.url }}</span>
          </span>
          <span class="kb-proxy-edit">
            <el-button :disabled="desktopFeaturesUnavailable" @click="openUrlDialog">修改</el-button>
          </span>
        </div>
      </div>
    </template>

    <p v-if="desktopFeaturesUnavailable" class="kb-settings-unavailable text-ink-quaternary">仅桌面端可用。</p>

    <el-dialog
      v-bind="dialog.elDialogBindings"
      v-model="urlDialogOpen"
      class="max-w-[400px]"
      close-on-press-escape
      :close-on-click-modal="false"
    >
      <template #header>
        <KbDialogHeader title="设置代理地址" eyebrow="代理设置" @close="urlDialogOpen = false" />
      </template>

      <el-input v-model="draftUrl" placeholder="协议://IP:端口" @keyup.enter="void commitUrl()" />
      <p v-if="errorMessage" class="kb-proxy-error text-error">{{ errorMessage }}</p>
      <div class="kb-proxy-confirm">
        <el-button type="primary" @click="void commitUrl()">确定</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style>
/* index-module_wrapper__929H / group / itemTitle / switcherCon / proxyEdit / confirm 段 */
.kb-proxy-wrapper {
  border-bottom: 1px solid var(--kb-border);
  padding-bottom: 16px;
}

.kb-proxy-group {
  padding: 8px 0;
}

.kb-proxy-wrapper h2 {
  color: var(--kb-text);
  font-size: 16px;
  font-weight: 500;
  margin: 24px 0;
}

.kb-proxy-title {
  font-weight: 700;
  padding-top: 5px;
}

.kb-proxy-switcher {
  padding-right: 8px;
  text-align: right;
}

.kb-proxy-edit {
  text-align: right;
}

.kb-proxy-info {
  font-weight: 400;
  margin-left: 8px;
}

.kb-proxy-confirm {
  margin-top: 8px;
  text-align: right;
}

.kb-proxy-error {
  font-size: 12px;
  line-height: 18px;
  margin: 4px 0 0;
}
</style>
