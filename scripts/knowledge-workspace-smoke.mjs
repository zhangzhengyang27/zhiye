/* global PointerEvent, document, HTMLElement, MouseEvent */

const STEP_PREFIX = "[smoke:workspace]"
import assert from "node:assert/strict"
import {
  apiRequest,
  assertNoPageErrors,
  attachPageDiagnostics,
  createBrowserPage,
  createDiagnostics,
  logStep,
  loginThroughUi,
  readAccessToken,
  smokeConfig,
} from "./lib/knowledge-smoke-utils.mjs"

async function createKnowledgeBase(token) {
  const stamp = Date.now()
  return apiRequest("/knowledge/knowledge-bases", {
    method: "POST",
    token,
    body: {
      name: `Smoke Workspace ${stamp}`,
      description: "用于验证工作区目录拖拽与语雀编辑器挂载。",
    },
    errorMessage: "创建知识库失败",
  })
}

async function createTreeNode(token, kbId, options) {
  return apiRequest("/knowledge/documents", {
    method: "POST",
    token,
    body: {
      kbId,
      title: options.title,
      type: options.type,
      status: options.status || "draft",
      parentId: options.parentId ?? null,
      content:
        options.type === "doc"
          ? {
              scheme: "text/markdown",
              value: options.content || `# ${options.title}\n\n用于目录拖拽 smoke。`,
            }
          : undefined,
    },
    errorMessage: `创建节点失败：${options.title}`,
  })
}

async function reorderTreeNodes(token, kbId, items) {
  return apiRequest("/knowledge/documents/reorder", {
    method: "POST",
    token,
    body: {
      kbId,
      items,
    },
    errorMessage: "初始化 smoke 目录顺序失败",
  })
}

function buildWorkspaceUrl(kbId) {
  return new globalThis.URL(`/knowledge/${kbId}`, smokeConfig.baseUrl).toString()
}

function buildDocumentUrl(kbId, docId) {
  return new globalThis.URL(`/knowledge/${kbId}/doc/${docId}`, smokeConfig.baseUrl).toString()
}

function getTreeRowLocator(page, nodeId) {
  return page.locator(`[data-knowledge-node-id="${nodeId}"]`).first()
}

function getTreeHandleLocator(page, nodeId) {
  return page
    .locator(`[data-knowledge-node-id="${nodeId}"] [data-knowledge-tree-drag-handle]`)
    .first()
}

async function waitForTreeReady(page) {
  const tree = page.locator('[role="tree"][aria-label="知识库目录"]').first()
  await tree.waitFor({ state: "visible", timeout: smokeConfig.timeout })
}

async function openWorkspace(page, kbId) {
  logStep(STEP_PREFIX, `打开知识库工作区 ${kbId}`)
  await page.goto(buildWorkspaceUrl(kbId), {
    waitUntil: "networkidle",
  })
  await waitForTreeReady(page)
}

async function openDocumentAndVerifyEditor(page, kbId, docId) {
  logStep(STEP_PREFIX, "打开文档编辑页，验证语雀编辑器挂载")
  await page.goto(buildDocumentUrl(kbId, docId), {
    waitUntil: "domcontentloaded",
  })

  const titleInput = page.locator('input[placeholder="无标题文档"]').first()
  await titleInput.waitFor({ state: "visible", timeout: smokeConfig.timeout })

  // Lake 编辑器由 yuque-editor-core 渲染 contenteditable 主体
  const editorSurface = page.locator(".yuque-doc-editor__surface").first()
  await editorSurface.waitFor({ state: "visible", timeout: smokeConfig.timeout })

  const editorContent = page.locator('.yuque-doc-editor__surface [contenteditable="true"]').first()
  await editorContent.waitFor({ state: "visible", timeout: smokeConfig.timeout })

  // 输入一段文本验证可编辑且 onChange 正常回传
  await editorContent.click()
  await page.keyboard.type("smoke")
  await page.waitForTimeout(500)
}

function getTargetPoint(box, position) {
  const centerX = box.x + box.width / 2

  if (position === "before") {
    return {
      x: centerX,
      y: box.y + 6,
    }
  }

  if (position === "inside") {
    return {
      x: centerX,
      y: box.y + box.height / 2,
    }
  }

  return {
    x: centerX,
    y: box.y + box.height - 6,
  }
}

async function dragNodeWithMouse(page, sourceNodeId, targetNodeId, position) {
  const sourceHandle = getTreeHandleLocator(page, sourceNodeId)
  const targetRow = getTreeRowLocator(page, targetNodeId)
  const sourceBox = await sourceHandle.boundingBox()

  assert.ok(sourceBox, `未找到源节点拖拽手柄：${sourceNodeId}`)

  const startPoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  }

  await page.mouse.move(startPoint.x, startPoint.y)
  await page.mouse.down()

  const moveIterations = position === "inside" ? 6 : 4

  for (let index = 0; index < moveIterations; index += 1) {
    const targetBox = await targetRow.boundingBox()

    assert.ok(targetBox, `未找到目标节点：${targetNodeId}`)

    const targetPoint = getTargetPoint(targetBox, position)
    await page.mouse.move(targetPoint.x, targetPoint.y, {
      steps: 4,
    })
    await page.waitForTimeout(position === "inside" ? 80 : 40)
  }

  await page.mouse.up()
}

async function dispatchTouchPointer(page, type, point, sourceNodeId) {
  await page.evaluate(
    ({ type, point, sourceNodeId }) => {
      const dispatchPointer = (target, type, point) => {
        const event = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          isPrimary: true,
          pointerType: "touch",
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: point.x,
          clientY: point.y,
          pageX: point.x,
          pageY: point.y,
        })

        target.dispatchEvent(event)
      }

      if (type === "pointerdown") {
        const startTarget =
          (sourceNodeId
            ? document.querySelector(
                `[data-knowledge-node-id="${sourceNodeId}"] [data-knowledge-tree-drag-handle]`,
              )
            : null) || document.elementFromPoint(point.x, point.y)

        if (!(startTarget instanceof HTMLElement)) {
          throw new Error("触屏拖拽起点不存在。")
        }

        dispatchPointer(startTarget, type, point)
        return
      }

      dispatchPointer(document, type, point)

      if (type === "pointerup") {
        document.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            button: 0,
            buttons: 0,
          }),
        )
      }
    },
    { type, point, sourceNodeId },
  )
}

async function dragNodeWithTouch(page, sourceNodeId, targetNodeId, position) {
  const sourceHandle = getTreeHandleLocator(page, sourceNodeId)
  const targetRow = getTreeRowLocator(page, targetNodeId)
  const sourceBox = await sourceHandle.boundingBox()

  assert.ok(sourceBox, `未找到触屏源节点拖拽手柄：${sourceNodeId}`)

  const startPoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  }

  await dispatchTouchPointer(page, "pointerdown", startPoint, sourceNodeId)
  await page.waitForTimeout(220)

  const moveIterations = position === "inside" ? 6 : 4
  let lastTargetPoint = startPoint

  for (let index = 0; index < moveIterations; index += 1) {
    const targetBox = await targetRow.boundingBox()

    assert.ok(targetBox, `未找到触屏目标节点：${targetNodeId}`)

    const nextTargetPoint = getTargetPoint(targetBox, position)

    for (let step = 1; step <= 4; step += 1) {
      const intermediatePoint = {
        x: lastTargetPoint.x + ((nextTargetPoint.x - lastTargetPoint.x) * step) / 4,
        y: lastTargetPoint.y + ((nextTargetPoint.y - lastTargetPoint.y) * step) / 4,
      }

      await dispatchTouchPointer(page, "pointermove", intermediatePoint)
      await page.waitForTimeout(24)
    }

    lastTargetPoint = nextTargetPoint
    await page.waitForTimeout(position === "inside" ? 48 : 32)
  }

  await dispatchTouchPointer(page, "pointerup", lastTargetPoint)
}

function parseRequestPayload(request) {
  return request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || "{}")
}

async function waitForReorderResult(page, trigger) {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("/knowledge/documents/reorder"),
    {
      timeout: smokeConfig.timeout,
    },
  )
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/knowledge/documents/reorder"),
    {
      timeout: smokeConfig.timeout,
    },
  )

  await trigger()

  const [request, response] = await Promise.all([requestPromise, responsePromise])

  return {
    request,
    response,
    payload: parseRequestPayload(request),
  }
}

function assertItemOrder(payload, idsInExpectedOrder) {
  const indexMap = new Map(payload.items.map((item) => [item.id, item.order]))

  for (let index = 0; index < idsInExpectedOrder.length - 1; index += 1) {
    const currentId = idsInExpectedOrder[index]
    const nextId = idsInExpectedOrder[index + 1]
    const currentOrder = indexMap.get(currentId)
    const nextOrder = indexMap.get(nextId)

    assert.equal(typeof currentOrder, "number", `未找到排序项：${currentId}`)
    assert.equal(typeof nextOrder, "number", `未找到排序项：${nextId}`)
    assert.ok(currentOrder < nextOrder, `排序顺序不正确：${currentId} 应位于 ${nextId} 前面`)
  }
}

function clearExpectedReorderFailureConsoleErrors(diagnostics) {
  diagnostics.consoleErrors = diagnostics.consoleErrors.filter(
    (message) =>
      message.trim() !==
      "Failed to load resource: the server responded with a status of 500 (Internal Server Error)",
  )
}

async function runDesktopTreeDragScenario(page, kbId, nodes, diagnostics) {
  logStep(STEP_PREFIX, "验证桌面端目录拖拽：同级排序")
  await openWorkspace(page, kbId)

  const reorderSameLevel = await waitForReorderResult(page, () =>
    dragNodeWithMouse(page, nodes.docB.id, nodes.docA.id, "before"),
  )

  assert.ok(reorderSameLevel.response.ok(), "同级拖拽排序请求失败")
  assert.equal(reorderSameLevel.payload.kbId, kbId)
  assertItemOrder(reorderSameLevel.payload, [nodes.docB.id, nodes.docA.id, nodes.folder.id])

  logStep(STEP_PREFIX, "验证桌面端目录拖拽：拖入目录")
  const reorderIntoFolder = await waitForReorderResult(page, () =>
    dragNodeWithMouse(page, nodes.docA.id, nodes.folder.id, "inside"),
  )

  assert.ok(reorderIntoFolder.response.ok(), "拖入目录排序请求失败")
  const movedIntoFolder = reorderIntoFolder.payload.items.find((item) => item.id === nodes.docA.id)
  assert.equal(movedIntoFolder?.parentId ?? null, nodes.folder.id, "文档未移动到目标目录")
  assert.equal(movedIntoFolder?.order, 0, "文档移动到空目录后的顺序应为 0")

  logStep(STEP_PREFIX, "验证桌面端目录拖拽：失败回滚")
  const failRouteHandler = (route) => {
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: "mock reorder failed",
      }),
    })
  }

  await page.route("**/knowledge/documents/reorder", failRouteHandler)
  const failedReorder = await waitForReorderResult(page, () =>
    dragNodeWithMouse(page, nodes.docB.id, nodes.docEditor.id, "before"),
  )

  assert.equal(failedReorder.response.status(), 500, "失败回滚场景未命中 mock 失败响应")
  await page.unroute("**/knowledge/documents/reorder", failRouteHandler)
  await page.waitForTimeout(600)
  clearExpectedReorderFailureConsoleErrors(diagnostics)

  const movedRow = getTreeRowLocator(page, nodes.docB.id)
  await movedRow.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  assert.equal(
    await movedRow.getAttribute("aria-level"),
    "1",
    "失败回滚后根层节点未恢复到原目录层级",
  )
}

async function runTouchTreeDragScenario(page, kbId, nodes, diagnostics) {
  logStep(STEP_PREFIX, "验证触屏目录拖拽：同级排序")
  await openWorkspace(page, kbId)

  const touchReorderSameLevel = await waitForReorderResult(page, () =>
    dragNodeWithTouch(page, nodes.docB.id, nodes.docA.id, "before"),
  )

  assert.ok(touchReorderSameLevel.response.ok(), "触屏同级拖拽排序请求失败")
  assertItemOrder(touchReorderSameLevel.payload, [nodes.docB.id, nodes.docA.id, nodes.folder.id])

  logStep(STEP_PREFIX, "验证触屏目录拖拽：拖入目录并自动展开")
  const touchReorderIntoFolder = await waitForReorderResult(page, () =>
    dragNodeWithTouch(page, nodes.docA.id, nodes.folder.id, "inside"),
  )

  assert.ok(touchReorderIntoFolder.response.ok(), "触屏拖入目录排序请求失败")
  const movedIntoFolder = touchReorderIntoFolder.payload.items.find(
    (item) => item.id === nodes.docA.id,
  )
  assert.equal(movedIntoFolder?.parentId ?? null, nodes.folder.id, "触屏拖入目录后 parentId 不正确")

  const folderRow = getTreeRowLocator(page, nodes.folder.id)
  await folderRow.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  assert.equal(
    await folderRow.getAttribute("aria-expanded"),
    "true",
    "触屏拖入目录后目标文件夹应自动展开",
  )

  logStep(STEP_PREFIX, "验证触屏目录拖拽：失败回滚")
  const failRouteHandler = (route) => {
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        message: "mock reorder failed",
      }),
    })
  }

  await page.route("**/knowledge/documents/reorder", failRouteHandler)
  const failedReorder = await waitForReorderResult(page, () =>
    dragNodeWithTouch(page, nodes.docB.id, nodes.docEditor.id, "before"),
  )

  assert.equal(failedReorder.response.status(), 500, "触屏失败回滚场景未命中 mock 失败响应")
  await page.unroute("**/knowledge/documents/reorder", failRouteHandler)
  await page.waitForTimeout(600)
  clearExpectedReorderFailureConsoleErrors(diagnostics)

  const movedRow = getTreeRowLocator(page, nodes.docB.id)
  await movedRow.waitFor({ state: "visible", timeout: smokeConfig.timeout })
  assert.equal(
    await movedRow.getAttribute("aria-level"),
    "1",
    "触屏失败回滚后根层节点未恢复到原目录层级",
  )
}

async function seedWorkspaceTree(token, kbId, prefix) {
  const stamp = Date.now()
  const docEditor = await createTreeNode(token, kbId, {
    title: `Smoke 验收文档 ${stamp}`,
    type: "doc",
    content: "# Smoke 验收\n\n用于验证登录后工作区与语雀编辑器挂载。",
  })
  const docA = await createTreeNode(token, kbId, {
    title: `拖拽文档 A ${stamp}`,
    type: "doc",
    content: "A",
  })
  const docB = await createTreeNode(token, kbId, {
    title: `拖拽文档 B ${stamp}`,
    type: "doc",
    content: "B",
  })
  const folder = await createTreeNode(token, kbId, {
    title: `拖拽目录 ${stamp}`,
    type: "folder",
  })

  await reorderTreeNodes(token, kbId, [
    {
      id: docEditor.id,
      parentId: null,
      order: 0,
    },
    {
      id: docA.id,
      parentId: null,
      order: 1,
    },
    {
      id: docB.id,
      parentId: null,
      order: 2,
    },
    {
      id: folder.id,
      parentId: null,
      order: 3,
    },
  ])

  logStep(prefix, `已创建 smoke 目录树：${docA.title} / ${docB.title} / ${folder.title}`)

  return {
    docEditor,
    docA,
    docB,
    folder,
  }
}

async function main() {
  const diagnostics = createDiagnostics()
  const touchDiagnostics = createDiagnostics()
  const { browser, page } = await createBrowserPage()
  const { browser: touchBrowser, page: touchPage } = await createBrowserPage({
    hasTouch: true,
    viewport: {
      width: 1440,
      height: 960,
    },
  })

  attachPageDiagnostics(page, diagnostics)
  attachPageDiagnostics(touchPage, touchDiagnostics)

  try {
    await loginThroughUi(page, STEP_PREFIX)
    const token = await readAccessToken(page)
    const desktopKnowledgeBase = await createKnowledgeBase(token)
    const touchKnowledgeBase = await createKnowledgeBase(token)
    const desktopNodes = await seedWorkspaceTree(token, desktopKnowledgeBase.id, STEP_PREFIX)
    const touchNodes = await seedWorkspaceTree(token, touchKnowledgeBase.id, STEP_PREFIX)

    assert.ok(desktopKnowledgeBase?.id, "未获取到桌面端知识库 ID")
    assert.ok(touchKnowledgeBase?.id, "未获取到触屏端知识库 ID")
    assert.ok(desktopNodes.docEditor?.id, "未获取到编辑器验收文档 ID")

    await openDocumentAndVerifyEditor(page, desktopKnowledgeBase.id, desktopNodes.docEditor.id)
    await runDesktopTreeDragScenario(page, desktopKnowledgeBase.id, desktopNodes, diagnostics)

    await loginThroughUi(touchPage, `${STEP_PREFIX}[touch]`)
    await runTouchTreeDragScenario(touchPage, touchKnowledgeBase.id, touchNodes, touchDiagnostics)

    assertNoPageErrors(diagnostics)
    assertNoPageErrors(touchDiagnostics)
    logStep(STEP_PREFIX, "工作区 smoke 通过")
  } finally {
    await touchPage.close()
    await touchBrowser.close()
    await page.close()
    await browser.close()
  }
}

main().catch((error) => {
  globalThis.console.error(`${STEP_PREFIX} 失败`, error)
  globalThis.process.exitCode = 1
})
