# 交互式多阶段问答流程实现总结

## 系统架构概述

本实现为交互式多阶段问答系统增加了三个工作流阶段的支持：
1. **operator_select** - 用户选择要使用的算子
2. **path_select** - 用户选择推理路径
3. **final** - 显示最终结论

## 后端实现 (Python/FastAPI)

### 文件: `backend/generation_pipeline.py`

核心功能已重构为可复用的函数式架构：

#### Stage 1 - 算子提取
- `extract_operator_view(input_data, question)` 
  - 执行降噪 + 算子提取
  - 返回 `operator_view` 对象，其中每个算子项被注入唯一的 `operator_key`
  - `operator_key` 格式: `pillar_index|pillar_name|operator_type|item_index`

#### Stage 2 - 过滤 + 段落生成
- `apply_operator_selection(operator_view, selected_keys)`
  - 根据用户选择的 `operator_key` 列表过滤算子
  - `entity_alignment` 类型强制全选（无法取消选择）
  - 其他类型可选
  
- `generate_pillar_results(question, input_data, operators)`
  - 基于过滤后的算子生成段落分析
  - 返回 pillar_analysis 数组与 stage3_global_synthesis

#### Stage 3 - 路径规划 + 答案生成
- `_plan_synthesis_paths(question, pillars, input_data, operators)`
  - 生成候选推理路径
  - 返回 paths 列表与初始选定路径
  
- `write_final_answer_with_path(question, brief, graph, path)`
  - 按指定路径ID生成最终答案
  - 支持路径选择后的答案定制

### 文件: `backend/api_server.py`

实现了会话管理和三个关键端点：

#### 会话管理
- 全局 `QA_SESSIONS: Dict[str, Dict]` 存储每个会话的状态
- 会话ID通过 `uuid.uuid4().hex` 生成，在会话生命周期内保持不变
- 存储内容：`input_data`, `question`, `operators`, `pillar_results`, `paths`

#### 端点 1: `/api/qa` (POST)
- 接收: `company_id`, `question`
- 执行: Stage 1 (降噪 + 算子提取)
- 返回:
  - `qa_session_id` - 会话标识
  - `workflow_phase: 'operator_select'` - 工作流阶段
  - `pillar_operator_view` - 算子视图
  - `intermediate` - 中间结果
  - `conclusion` - 占位符结论（会在后续阶段更新）

#### 端点 2: `/api/qa/operators/submit` (POST)
- 接收: `qa_session_id`, `selected_operator_keys: string[]`
- 执行: Stage 2 (过滤算子 + 生成段落 + 规划路径)
- 返回:
  - `workflow_phase: 'path_select'` - 转向路径选择阶段
  - `conclusion` - 包含 pillar_analysis 和 stage3_global_synthesis
  - 更新会话状态

#### 端点 3: `/api/qa/path/submit` (POST)
- 接收: `qa_session_id`, `selected_path_id: string`
- 执行: Stage 3 (按路径生成最终答案)
- 返回:
  - `workflow_phase: 'final'` - 工作流完成
  - `conclusion` - 最终答案

## 前端实现 (Vue 3 + TypeScript)

### 类型定义 (`src/types/operator.ts`)

所有算子接口已扩展以支持 `operator_key` 字段：
```typescript
interface CausalAnchoringItem { operator_key?: string; ... }
interface EntityAlignmentItem { operator_key?: string; ... }
interface ConflictItem { operator_key?: string; ... }
interface NarrativeRelationItem { operator_key?: string; ... }

interface OperatorSelectableItem {
  key: string
  type: string
  pillar: string
  label: string
}
```

### 顶层状态管理 (`src/App.vue`)

新增工作流状态：
```typescript
const qaSessionId = ref<string | null>(null)
const qaWorkflowPhase = ref<'operator_select' | 'path_select' | 'final'>('final')
```

事件: `handleQuestionComplete(payload)` 接收：
- `qaSessionId` - 会话标识
- `workflowPhase` - 工作流阶段
- `operatorView` - 算子视图
- `conclusion` - 结论

### 问题提交流程 (`src/components/DocumentView.vue`)

- 调用 `/api/qa` 获取 `qa_session_id` 和初始 `pillar_operator_view`
- 发送事件至 App.vue 更新全局状态
- 静态示例（快捷键0-4）返回 `workflowPhase: 'final'`（非交互式）
- 真实后端调用返回 `workflowPhase: 'operator_select'`（交互式）

### 工作流UI组件

#### `ConclusionPanel.vue`
- 接收 props: `workflowPhase`, `submittingOperator`, `submittingPath`
- 根据阶段条件渲染不同的模态框
- 传递工作流信息至子组件

#### `OperatorGraphModal.vue` (算子选择界面)
在 `workflowPhase === 'operator_select'` 时显示：
- 图可视化 (节点代表指标，边代表关系)
- **底部操作栏**：
  - 显示已选算子计数
  - "查看已选" 按钮 → 弹窗显示已选项列表
  - "确认选择的算子" 按钮 → 提交至 `/api/qa/operators/submit`
- 提交成功后，更新 `workflowPhase` 至 `'path_select'`

#### `Stage3GraphModal.vue` (路径选择界面)
在 `workflowPhase === 'path_select'` 时显示：
- 路径候选列表 (上方标签栏)
- 推理图可视化 (中央)
- 路径详情面板 (右侧)
- **底部操作栏**（新增）：
  - "确认选择此路径" 按钮 → 提交至 `/api/qa/path/submit`
- 提交成功后，更新 `workflowPhase` 至 `'final'`

#### `DynamicResultView.vue` (主容器)
- 接收 props: `qaSessionId`, `workflowPhase`, `operatorView`
- 根据 `workflowPhase` 条件渲染：
  - `'operator_select'` → 显示 OperatorGraphModal
  - `'path_select'` → 显示 Stage3GraphModal
  - `'final'` → 显示 ConclusionPanel
- 处理 `submitOperators` 和 `submitPath` 事件
- 调用后端新增端点并更新状态

## 数据流

```
用户输入问题
    ↓
DocumentView → /api/qa (POST)
    ↓
[返回] qa_session_id + operator_view + workflowPhase='operator_select'
    ↓
App.vue 更新状态 → DynamicResultView 显示 OperatorGraphModal
    ↓
用户在图中选择算子 → 点击"确认选择的算子"
    ↓
OperatorGraphModal → /api/qa/operators/submit (POST)
    ↓
[返回] pillar_results + stage3_global_synthesis + workflowPhase='path_select'
    ↓
DynamicResultView 显示 Stage3GraphModal
    ↓
用户选择推理路径 → 点击"确认选择此路径"
    ↓
Stage3GraphModal → /api/qa/path/submit (POST)
    ↓
[返回] final_conclusion + workflowPhase='final'
    ↓
DynamicResultView 显示 ConclusionPanel
    ↓
展示最终结论
```

## 兼容性说明

### 静态示例模式
- 快捷键 0-4 加载前端本地 JSON 文件
- 返回 `workflowPhase: 'final'`，跳过交互阶段
- 保持向后兼容

### API 响应占位符
- 当回调 `/api/qa` 时，`conclusion` 为占位符结构
- 完整的 `conclusion` 在 `/api/qa/operators/submit` 后返回
- 此设计减少首次响应大小，提升用户体验

## 测试检查清单

- [ ] 后端 `/api/qa` 返回正确的 `qa_session_id` 和 `operator_view`
- [ ] 前端 DocumentView 正确传递 `qaSessionId` 和 `workflowPhase` 至 App.vue
- [ ] OperatorGraphModal 显示在 `operator_select` 阶段
- [ ] 选择算子后点击"确认"调用 `/api/qa/operators/submit`
- [ ] 后端成功执行 Stage 2，返回 `pillar_results` 和 `stage3_global_synthesis`
- [ ] DynamicResultView 切换至 Stage3GraphModal（`workflowPhase='path_select'`）
- [ ] 用户在 Stage3GraphModal 中选择路径
- [ ] 点击"确认选择此路径"调用 `/api/qa/path/submit`
- [ ] 后端成功执行 Stage 3，返回完整 `conclusion`
- [ ] DynamicResultView 显示 ConclusionPanel（`workflowPhase='final'`）
- [ ] 最终结论渲染正确

## 已知限制与后续改进

1. **算子选择交互**
   - 当前 UI 框架已准备，但点击节点/边时的选择逻辑需在测试时根据 UX 反馈调整
   - 考虑支持 Ctrl+Click 多选、框选等高级交互

2. **会话超时**
   - 当前会话存储在内存中，服务器重启会丢失
   - 建议生产环境改用 Redis 或数据库存储

3. **错误处理**
   - 需要完善各端点的异常处理与用户提示
   - 建议添加请求超时与重试机制

4. **算子过滤规则**
   - 当前 `entity_alignment` 强制全选硬编码在代码中
   - 建议配置化处理不同算子类型的选择策略

## 文件清单

### 后端
- `backend/generation_pipeline.py` - 核心算法 (Stage 1-3)
- `backend/api_server.py` - HTTP API (3个端点 + 会话管理)

### 前端
- `src/types/operator.ts` - 类型定义
- `src/App.vue` - 顶层状态与工作流协调
- `src/components/DocumentView.vue` - 问题提交
- `src/components/ConclusionPanel/ConclusionPanel.vue` - 工作流容器
- `src/components/ConclusionPanel/Stage3GraphModal.vue` - 路径选择 UI
- `src/components/TreePanel/OperatorGraphModal.vue` - 算子选择 UI
- `src/components/DynamicResultView.vue` - 主结果展示容器

## 总结

本次实现为系统引入了**交互式多阶段问答流程**，用户现在可以：
1. 看到问题对应的算子抽取结果
2. 选择要使用的算子，定制推理逻辑
3. 从多个推理路径中选择最合适的一条
4. 获得针对选定路径的最终结论

整个流程通过前后端会话管理进行协调，保证数据一致性和用户体验。
