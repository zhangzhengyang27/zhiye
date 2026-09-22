<script setup lang="ts">
/**
 * EP 2.14.5 原生行为探针页（Task T1）：只摆原生 el-* 组件，不引入任何 App* 适配层。
 * 行为记录统一写入 window.__probe，由 scripts/verify-ep-native-behavior.mjs 断言。
 * 页面各节独立，测试之间由驱动脚本 reload 页面重置状态。
 */
import { ref } from "vue"
type ProbeValue = string | number | boolean | null | undefined
const log = (scope: string, key: string, value: unknown) => {
  window.__probe.push({ scope, key, value })
}
// ---------- 1. 嵌套 Esc ----------
const escA = ref(false)
const escB = ref(false)
// ---------- 2. 滚动锁 ----------
const scrollA = ref(false)
const scrollB = ref(false)
// ---------- 3. 焦点开合 ----------
const focusOpen = ref(false)
// ---------- 4. data-autofocus ----------
const af1Open = ref(false)
const af2Open = ref(false)
// ---------- 5. IME Esc ----------
const imeOpen = ref(false)
const imeValue = ref("")
// ---------- 6. el-dropdown ----------
const logDdCommand = (scope: string) => (value: unknown) => log(scope, "command", String(value ?? "(空)"))
// ---------- 7. el-select 空值语义 ----------
const sel1Value = ref<ProbeValue>("")
const sel2Value = ref<ProbeValue>("")
const sel3Value = ref<ProbeValue>("甲")
const logSelect = (scope: string) => (value: unknown) => {
  log(scope, "update", value === undefined ? "undefined" : String(value))
  log(scope, "updateType", typeof value)
}
</script>
<template>
  <div class="probe-page">
    <h1>EP 2.14.5 原生行为探针</h1>
    <!-- 滚动锁测试依赖页面超高可滚 -->
    <div class="tall-spacer" aria-hidden="true"></div>
    <!-- 1. 嵌套 Esc -->
    <section>
      <h2>1. 嵌套 Esc</h2>
      <button id="probe-esc-open-a" type="button" @click="escA = true">打开对话框A</button>
      <el-dialog v-model="escA" title="嵌套Esc-A" append-to-body>
        <button id="probe-esc-open-b" type="button" @click="escB = true">打开对话框B</button>
        <template #footer>
          <button id="probe-esc-a-close" type="button" @click="escA = false">关闭A</button>
        </template>
      </el-dialog>
      <el-dialog v-model="escB" title="嵌套Esc-B" append-to-body>
        <input id="probe-esc-b-input" placeholder="B 内输入框" />
        <template #footer>
          <button id="probe-esc-b-close" type="button" @click="escB = false">关闭B</button>
        </template>
      </el-dialog>
    </section>
    <!-- 2. 滚动锁 -->
    <section>
      <h2>2. 滚动锁</h2>
      <button id="probe-scroll-open-a" type="button" @click="scrollA = true">打开对话框A（lock-scroll 默认）</button>
      <el-dialog v-model="scrollA" title="滚动锁-A" append-to-body>
        <button id="probe-scroll-open-b-in-a" type="button" @click="scrollB = true">打开对话框B</button>
        <template #footer>
          <button id="probe-scroll-a-close" type="button" @click="scrollA = false">关闭A</button>
        </template>
      </el-dialog>
      <el-dialog v-model="scrollB" title="滚动锁-B" append-to-body>
        <template #footer>
          <button id="probe-scroll-close-a-under" type="button" @click="scrollA = false">关闭底层A</button>
          <button id="probe-scroll-b-close" type="button" @click="scrollB = false">关闭B</button>
        </template>
      </el-dialog>
    </section>
    <!-- 3. 焦点开合 -->
    <section>
      <h2>3. 焦点开合还原</h2>
      <button id="probe-focus-trigger" type="button" @click="focusOpen = true">打开焦点对话框</button>
      <el-dialog v-model="focusOpen" title="焦点开合" append-to-body>
        <input id="probe-focus-input" placeholder="对话框内输入框" />
        <template #footer>
          <button id="probe-focus-close" type="button" @click="focusOpen = false">关闭</button>
        </template>
      </el-dialog>
    </section>
    <!-- 4. data-autofocus -->
    <section>
      <h2>4. data-autofocus</h2>
      <button id="probe-af1-open" type="button" @click="af1Open = true">打开 data-autofocus 对话框</button>
      <button id="probe-af2-open" type="button" @click="af2Open = true">打开 el-input autofocus 对话框</button>
      <el-dialog v-model="af1Open" title="data-autofocus探测" append-to-body>
        <input id="probe-af1-first" placeholder="普通input在前" />
        <input id="probe-af1-marked" data-autofocus placeholder="标记input在后" />
        <template #footer>
          <button id="probe-af1-close" type="button" @click="af1Open = false">关闭</button>
        </template>
      </el-dialog>
      <el-dialog v-model="af2Open" title="el-input-autofocus探测" append-to-body>
        <el-input id="probe-af2-first" placeholder="普通el-input在前" />
        <el-input id="probe-af2-auto" autofocus placeholder="autofocus el-input 在后" />
        <template #footer>
          <button id="probe-af2-close" type="button" @click="af2Open = false">关闭</button>
        </template>
      </el-dialog>
    </section>
    <!-- 5. IME Esc -->
    <section>
      <h2>5. IME 组词 Esc</h2>
      <button id="probe-ime-open" type="button" @click="imeOpen = true">打开 IME 对话框</button>
      <el-dialog v-model="imeOpen" title="IME探测" append-to-body>
        <el-input id="probe-ime-input" v-model="imeValue" placeholder="在这里按 Esc（合成 isComposing 事件）" />
        <template #footer>
          <button id="probe-ime-close" type="button" @click="imeOpen = false">关闭</button>
        </template>
      </el-dialog>
    </section>
    <!-- 6. el-dropdown（触发器用外层 div 稳定锚定：EP ElOnlyChild 克隆触发器并覆盖其 id） -->
    <section>
      <h2>6. el-dropdown 能力边界</h2>
      <div id="probe-dd1" class="probe-dd-wrap">
        <el-dropdown trigger="click" @command="v => logDdCommand('dd1')(v)">
          <button type="button">基础菜单 ▾</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="item-1">上一项</el-dropdown-item>
              <el-dropdown-item command="item-2" disabled>禁用项</el-dropdown-item>
              <el-dropdown-item command="item-3">下一项</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div id="probe-dd2" class="probe-dd-wrap">
        <el-dropdown trigger="click" :hide-on-click="false" @command="v => logDdCommand('dd2-outer')(v)">
          <button type="button">嵌套菜单 ▾</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="outer-a">外层项A</el-dropdown-item>
              <el-dropdown-item command="outer-parent">
                <span id="probe-dd2-inner-wrap">
                  <el-dropdown trigger="click" :hide-on-click="false" @command="v => logDdCommand('dd2-inner')(v)">
                    <span>内层菜单 ▸</span>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="inner-b">内层项B</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div id="probe-dd3" class="probe-dd-wrap">
        <el-dropdown trigger="click" @command="v => logDdCommand('dd3')(v)">
          <button type="button">分组菜单 ▾</button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="title" disabled class="probe-dd-group-title"
                >分组标题（禁用项充当）</el-dropdown-item
              >
              <el-dropdown-item command="item-a">组内项A</el-dropdown-item>
              <el-dropdown-item command="item-b" divided>分隔线后项B</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </section>
    <!-- 7. el-select 空值语义 -->
    <section>
      <h2>7. el-select 空值语义</h2>
      <div class="probe-select-row">
        <span class="probe-select-label">sel1（modelValue=""，无空值选项）</span>
        <el-select
          id="probe-sel1"
          :model-value="sel1Value"
          placeholder="请选择sel1"
          @update:model-value="
            v => {
              sel1Value = v as ProbeValue
              logSelect('sel1')(v)
            }
          "
        >
          <el-option label="甲" value="甲" />
          <el-option label="乙" value="乙" />
          <el-option label="丙" value="丙" />
        </el-select>
      </div>
      <div class="probe-select-row">
        <span class="probe-select-label">sel2（modelValue=""，含 value="" 选项）</span>
        <el-select
          id="probe-sel2"
          :model-value="sel2Value"
          placeholder="请选择sel2"
          @update:model-value="
            v => {
              sel2Value = v as ProbeValue
              logSelect('sel2')(v)
            }
          "
        >
          <el-option label="根目录" value="" />
          <el-option label="甲" value="甲" />
          <el-option label="乙" value="乙" />
        </el-select>
      </div>
      <div class="probe-select-row">
        <span class="probe-select-label">sel3（clearable，已选「甲」）</span>
        <el-select
          id="probe-sel3"
          :model-value="sel3Value"
          clearable
          placeholder="请选择sel3"
          @update:model-value="
            v => {
              sel3Value = v as ProbeValue
              logSelect('sel3')(v)
            }
          "
          @clear="log('sel3', 'clear', 'fired')"
        >
          <el-option label="甲" value="甲" />
          <el-option label="乙" value="乙" />
        </el-select>
      </div>
    </section>
    <div class="tall-spacer" aria-hidden="true"></div>
  </div>
</template>
<style>
* {
  box-sizing: border-box;
}
/* headless Chromium 默认 overlay 滚动条（宽度测量为 0），强制经典滚动条宽度，
   让 EP useLockscreen 的「滚动条宽度补偿」分支（body width calc(100% - Npx)）
   在运行时真实触发而非仅存在于源码。 */
*::-webkit-scrollbar {
  width: 15px;
  height: 15px;
}
body {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
.probe-page {
  padding: 24px;
}
.probe-page h1 {
  font-size: 20px;
}
.probe-page section {
  margin-bottom: 32px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
.probe-page h2 {
  margin: 0 0 12px;
  font-size: 15px;
}
.probe-page button {
  margin-right: 8px;
  padding: 4px 10px;
  cursor: pointer;
}
.probe-page input {
  padding: 4px 8px;
}
.tall-spacer {
  height: 1200px;
}
.probe-select-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.probe-select-label {
  width: 320px;
  font-size: 13px;
}
.probe-select-row .el-select {
  width: 200px;
}
.probe-dd-group-title {
  color: #a8abb2;
  cursor: default;
}
.probe-dd-wrap {
  display: inline-block;
  margin-right: 16px;
}
#probe-dd2-inner-wrap {
  color: #409eff;
}
</style>
