# 交互式多阶段问答流程 - 测试指南

## 快速开始

### 前置准备
1. 后端服务运行正常（FastAPI 服务启动）
2. 前端开发服务运行（`npm run dev`）
3. 浏览器打开 `http://localhost:5173`

## 测试场景 1: 静态示例 (非交互式)

### 步骤
1. 进入前端应用首页
2. 在问题输入框输入 **数字 0-4**（快捷键）
3. 按 Enter 或点击"提问"按钮

### 预期结果
- 页面加载本地 JSON 示例数据
- 不经过后端 API，直接显示完整结论
- `workflowPhase` 保持为 `'final'`
- ConclusionPanel 直接渲染最终结论

### 对应代码
- `src/components/DocumentView.vue` - DEMO_FILES 配置
- 示例数据位置: `public/data*/` 目录

---

## 测试场景 2: 完整交互式流程

### Step 1: 问题提交 → 算子选择阶段

#### 步骤
1. 清空问题框，输入实际问题（例如: "公司财务状况如何？"）
2. 确保后端服务可访问
3. 点击"提问"按钮

#### 预期结果

**前端行为**
- DocumentView 调用 `/api/qa` (POST)
- 显示加载中状态（`asking.value = true`）
- 请求完成后：
  - 接收 `qa_session_id` (UUID format)
  - 接收 `pillar_operator_view` (算子视图)
  - 接收 `workflow_phase: 'operator_select'`

**后端行为**
- 执行 Stage 1 (降噪 + 算子提取)
- 为每个算子项生成唯一的 `operator_key`
- 返回 HTTP 200 响应

**UI 变化**
- 左侧 TreePanel 加载操作符图
- 右侧 DynamicResultView 显示 OperatorGraphModal
- 底部出现操作栏: "已选算子: 0 个" + "查看已选" 按钮 + "确认选择的算子" 按钮

#### 调试检查点

```javascript
// 在浏览器 DevTools 控制台检查:
console.log(window.__VITE_GLOBAL_STATE__.qaSessionId)  // 应该有UUID
console.log(window.__VITE_GLOBAL_STATE__.qaWorkflowPhase)  // 应该是 'operator_select'
```

#### 后端日志检查

```python
# 后端应输出类似日志:
[api_server.py] Handling /api/qa with question: "公司财务状况如何？"
[generation_pipeline.py] Stage 1: extract_operator_view completed
[api_server.py] Created session: {uuid}
```

---

### Step 2: 选择算子

#### 当前状态
- OperatorGraphModal 显示中
- 尚未选择任何算子

#### 步骤

**方式 A: 通过 UI 选择（预期的最终实现）**
- 在图上点击代表指标的节点或边
- 已选算子计数增加
- 点击"查看已选" 可查看详情

*注*: 当前实现尚未添加点击事件处理，可通过 DevTools 手动测试

**方式 B: 通过 DevTools 手动测试**

```javascript
// 在浏览器控制台模拟用户选择
// 假设后端返回的 operator_view 中有以下算子:
// causal_anchoring: 2项
// entity_alignment: 1项
// narrative_relations: 3项

// 模拟选择所有算子:
const mockKeys = [
  '0|Financial|causal_anchoring|0',
  '0|Financial|causal_anchoring|1',
  '0|Financial|entity_alignment|0',
  '0|Financial|narrative_relations|0',
  '0|Financial|narrative_relations|1',
  '0|Financial|narrative_relations|2'
]
// 然后调用提交方法...
```

#### 预期结果
- 已选计数更新
- "确认选择的算子" 按钮从禁用变为启用

---

### Step 3: 提交算子选择 → 路径选择阶段

#### 步骤
1. 点击底部 "确认选择的算子" 按钮
2. 按钮变为 "提交中..." 状态

#### 预期结果

**前端行为**
- DynamicResultView 调用 `/api/qa/operators/submit` (POST)
- 请求体包含:
  ```json
  {
    "qa_session_id": "{uuid}",
    "selected_operator_keys": [
      "0|Financial|causal_anchoring|0",
      "0|Financial|entity_alignment|0",
      ...
    ]
  }
  ```

**后端行为**
- Stage 2 执行: 
  - `apply_operator_selection()` - 过滤算子（entity_alignment 强制全选）
  - `generate_pillar_results()` - 生成段落分析
  - `_plan_synthesis_paths()` - 规划推理路径
- 返回 HTTP 200 响应，包含:
  ```json
  {
    "workflow_phase": "path_select",
    "conclusion": {
      "pillar_analysis": [...],
      "stage3_global_synthesis": {
        "tree_graph": {...},
        "candidate_paths": [...]
      }
    }
  }
  ```

**UI 变化**
- 右侧 OperatorGraphModal 关闭
- 右侧显示 Stage3GraphModal
- 上方路径选项卡显示多个候选路径
- 中央图显示推理结构
- 右下角出现 "确认选择此路径" 按钮

#### 调试检查点

```javascript
// 检查工作流状态
console.log(window.__VITE_GLOBAL_STATE__.qaWorkflowPhase)  // 应该是 'path_select'
console.log(window.__VITE_GLOBAL_STATE__.conclusion?.stage3_global_synthesis?.candidate_paths?.length)  // 应该 > 0
```

---

### Step 4: 选择路径 → 最终答案阶段

#### 当前状态
- Stage3GraphModal 显示中
- 显示多条候选路径

#### 步骤
1. 在上方路径选项卡中点击选择一条路径（例如: "path_1"）
2. 中央图和右侧详情更新为该路径的信息
3. 点击底部 "确认选择此路径" 按钮

#### 预期结果

**前端行为**
- Stage3GraphModal 调用 `/api/qa/path/submit` (POST)
- 请求体包含:
  ```json
  {
    "qa_session_id": "{uuid}",
    "selected_path_id": "path_1"
  }
  ```

**后端行为**
- Stage 3 执行:
  - `write_final_answer_with_path()` - 按指定路径生成最终答案
- 返回 HTTP 200 响应，包含:
  ```json
  {
    "workflow_phase": "final",
    "conclusion": {
      "original_question": "...",
      "final_answer": "...",
      "pillar_analysis": [...],
      "stage3_global_synthesis": {...}
    }
  }
  ```

**UI 变化**
- 右侧 Stage3GraphModal 关闭
- 右侧显示 ConclusionPanel
- 显示完整的最终答案和逐段分析
- 可交互查看每个 pillar 的支撑证据

#### 调试检查点

```javascript
// 检查最终结论
console.log(window.__VITE_GLOBAL_STATE__.conclusion?.final_answer)  // 应该包含完整答案
console.log(window.__VITE_GLOBAL_STATE__.qaWorkflowPhase)  // 应该是 'final'
```

---

## 常见问题排查

### 问题 1: "已选算子: 0 个" 但无法选择

**原因**: UI 点击事件处理未完全实现

**解决方案**:
- 使用 DevTools 手动模拟选择（见 Step 2-B）
- 或实现 OperatorGraphModal 中的 `toggleNodeSelection` / `toggleEdgeSelection` 事件处理

### 问题 2: `/api/qa/operators/submit` 返回 500 错误

**排查步骤**:
1. 检查后端日志中的错误消息
2. 验证 `selected_operator_keys` 格式是否正确
3. 确认 `qa_session_id` 在后端 `QA_SESSIONS` 中存在

### 问题 3: 刷新页面后工作流状态丢失

**原因**: 会话状态仅存于内存和前端 state，刷新后前端状态重置

**预期行为**: 这是正常的，用户需要从头开始

**改进建议**: 添加 URL 参数或 localStorage 持久化会话

### 问题 4: Stage3GraphModal 中的图无法显示

**排查步骤**:
1. 检查 `stage3_global_synthesis.tree_graph` 数据是否存在
2. 验证图布局计算是否有误（见 `buildPillarRegions`）
3. 检查 SVG 坐标计算

---

## 性能和监控

### 建议添加的监控点

```javascript
// 记录每个阶段的耗时
const stageMetrics = {
  stage1: null,  // 算子提取
  stage2: null,  // 段落生成
  stage3: null,  // 路径规划和答案生成
}

// 在各阶段起始和结束时记录时间戳
performance.mark('stage1-start')
// ... API 调用
performance.mark('stage1-end')
performance.measure('stage1', 'stage1-start', 'stage1-end')
```

### 后端优化建议

1. 缓存算子提取结果（相同问题无需重复执行）
2. 异步生成候选路径（不阻塞主响应）
3. 实现会话过期机制（避免内存泄漏）

---

## 清单

- [ ] 快捷键 0-4 静态示例工作正常
- [ ] `/api/qa` 返回 `qa_session_id` 和 `operator_view`
- [ ] OperatorGraphModal 显示在 `operator_select` 阶段
- [ ] 选择算子后提交至 `/api/qa/operators/submit`
- [ ] 后端返回 `stage3_global_synthesis` 和候选路径
- [ ] Stage3GraphModal 显示在 `path_select` 阶段
- [ ] 路径提交至 `/api/qa/path/submit`
- [ ] 后端返回完整的最终结论
- [ ] ConclusionPanel 显示在 `final` 阶段
- [ ] 最终答案和 pillar 分析正确渲染
