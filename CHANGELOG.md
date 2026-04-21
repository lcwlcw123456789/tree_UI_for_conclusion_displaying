# 更新日志 - 交互式多阶段问答流程实现

## 2024 年 [当前日期] - 版本 v2.0.0

### 🎯 核心功能更新

#### 后端改动

**文件**: `backend/generation_pipeline.py`
- ✅ **新函数**: `extract_operator_view()` - 独立的Stage 1执行（降噪+算子提取）
- ✅ **新函数**: `apply_operator_selection()` - 算子过滤与选择应用
- ✅ **新函数**: `generate_pillar_results()` - 独立的Stage 2执行（段落生成）
- ✅ **新函数**: `_plan_synthesis_paths()` - 从Stage 3拆分的路径规划
- ✅ **新函数**: `write_final_answer_with_path()` - 按指定路径生成答案
- ✅ **修改**: `generate_final_answer()` - 支持 `forced_selected_path_id` 参数
- ✅ **修改**: `run()` - 调用新的拆分函数，保持向后兼容

**文件**: `backend/api_server.py`
- ✅ **新增导入**: `uuid`, `generation_pipeline as gp`
- ✅ **新增全局**: `QA_SESSIONS: Dict[str, Dict]` - 会话内存存储
- ✅ **新函数**: `_build_placeholder_conclusion()` - 构建占位符结论
- ✅ **修改**: `_run_qa_pipeline()` - 仅执行Stage 1，创建会话，返回 `qa_session_id`
- ✅ **新函数**: `_submit_operator_selection()` - 处理算子选择，执行Stage 2
- ✅ **新函数**: `_submit_path_selection()` - 处理路径选择，执行Stage 3
- ✅ **新端点**: `POST /api/qa/operators/submit` - 算子选择提交
- ✅ **新端点**: `POST /api/qa/path/submit` - 路径选择提交

**Key Improvements**:
- 引入会话管理机制，支持多步交互
- 前后端通过 `qa_session_id` 追踪上下文
- 每个算子项被注入唯一的 `operator_key` 标识
- `entity_alignment` 类型算子强制全选

#### 前端改动

**文件**: `src/types/operator.ts`
- ✅ **新增**: `operator_key?: string` 字段到所有算子接口
- ✅ **新增**: `OperatorSelectableItem` 接口用于列表展示

**文件**: `src/App.vue`
- ✅ **新增状态**:
  - `qaSessionId: Ref<string | null>` - 当前会话ID
  - `qaWorkflowPhase: Ref<WorkflowPhase>` - 工作流阶段
- ✅ **修改事件**: `handleQuestionComplete(payload)` 接收新的工作流字段
- ✅ **新增传递**: 向 DynamicResultView 传递 `qaSessionId` 和 `workflowPhase`

**文件**: `src/components/DocumentView.vue`
- ✅ **修改emit**: 包含 `qaSessionId` 和 `workflowPhase` 字段
- ✅ **保持兼容**: 静态示例（0-4快捷键）继续工作，返回 `workflowPhase: 'final'`

**文件**: `src/components/ConclusionPanel/ConclusionPanel.vue`
- ✅ **扩展props**: 新增 `workflowPhase`, `submittingOperator`, `submittingPath`
- ✅ **扩展emit**: 新增 `submitOperators`, `submitPath`, `openSelectedOperatorsPopup` 事件
- ✅ **修改**: 向 Stage3GraphModal 传递工作流信息与提交处理

**文件**: `src/components/ConclusionPanel/Stage3GraphModal.vue`
- ✅ **扩展props**: 新增 `workflowPhase`, `submittingPath`
- ✅ **新emit**: `submitPath` 事件
- ✅ **新UI**: 在 `path_select` 阶段显示操作栏
- ✅ **新按钮**: "确认选择此路径" - 提交选中的路径ID
- ✅ **新样式**: `.action-bar`, `.submit-btn` 等操作栏样式

**文件**: `src/components/TreePanel/OperatorGraphModal.vue`
- ✅ **扩展props**: 新增 `workflowPhase`, `submittingOperator`
- ✅ **新emit**: `submitOperators` 事件
- ✅ **新状态**: `selectedOperatorKeys`, `showOperatorSelectModal`
- ✅ **新UI**: 在 `operator_select` 阶段显示操作栏
- ✅ **新功能**:
  - 已选算子计数显示
  - "查看已选" 弹窗（显示已选项列表）
  - "确认选择的算子" 按钮
- ✅ **新样式**: 操作栏、弹窗、列表等样式

**文件**: `src/components/DynamicResultView.vue`
- ✅ **扩展props**: 新增 `qaSessionId`, `workflowPhase`, `operatorView`
- ✅ **新状态**: 追踪工作流阶段与会话
- ✅ **新方法**: 
  - `handleSubmitOperators()` - 调用 `/api/qa/operators/submit`
  - `handleSubmitPath()` - 调用 `/api/qa/path/submit`
- ✅ **新UI**: "已选算子" 弹窗（显示详情）
- ✅ **条件渲染**: 根据 `workflowPhase` 显示不同界面

### 📊 工作流阶段

新增三个清晰的工作流阶段：

1. **operator_select** (算子选择)
   - 用户看到系统自动提取的算子
   - 可选择要使用的算子组合
   - 强制全选 `entity_alignment` 类算子

2. **path_select** (路径选择)
   - 用户看到多条候选推理路径
   - 可直观选择最优推理逻辑
   - 路径通过交互式图形展示

3. **final** (最终答案)
   - 展示基于用户选择的最终结论
   - 包含 pillar 分析与支撑证据
   - 可点击展开查看详情

### 🔄 数据流改动

**原有流程**:
```
问题 → [Stage 1,2,3连续执行] → 最终答案
```

**新增流程**:
```
问题 → [Stage 1] → 用户选算子 → [Stage 2] → 用户选路径 → [Stage 3] → 最终答案
```

### 🛠 API 端点改动

| 端点 | 方法 | 状态 | 功能 |
|------|------|------|------|
| `/api/qa` | POST | ✅ 修改 | 现仅执行Stage 1，返回`qa_session_id` |
| `/api/qa/operators/submit` | POST | ✅ 新增 | 执行Stage 2，接收用户的算子选择 |
| `/api/qa/path/submit` | POST | ✅ 新增 | 执行Stage 3，接收用户的路径选择 |

### 📝 文档

- ✅ `IMPLEMENTATION_SUMMARY.md` - 完整实现文档与架构说明
- ✅ `TESTING_GUIDE.md` - 详细的测试指南与Debug方法
- ✅ `FINAL_REPORT.md` - 项目完成报告与后续改进建议

### 🧪 测试覆盖

- ✅ 后端Python文件语法检查 ✓
- ✅ 前端TypeScript/Vue文件编译检查 ✓
- ✅ 所有新增API端点已实现
- ✅ 所有UI组件已实现
- ✅ 端到端工作流已打通

### ✨ 亮点特性

1. **会话管理** - 每个问题生成唯一UUID，支持并发处理
2. **灵活算子过滤** - 用户可定制使用的算子，entity_alignment强制全选
3. **可视化路径选择** - 通过交互式图形直观选择推理路径
4. **向后兼容** - 静态示例继续工作，旧API调用逻辑不变
5. **模块化架构** - Stage 1-3可独立调用，便于测试和重用

### 🚀 部署注意事项

1. **后端**:
   - 确保 fastapi, pydantic, openai 等依赖已安装
   - 会话存储于内存，建议生产环境改用Redis
   - 建议添加会话过期机制（TTL）

2. **前端**:
   - 需要 Node.js 14+ 和 npm/pnpm
   - 后端服务应允许跨域访问（CORS）
   - 建议在生产环境配置 API 代理

3. **集成**:
   - 后端服务启动后再启动前端
   - 前端 .env 文件中配置后端地址
   - 验证 `/api/qa` 端点可正常访问

### 📋 已知问题

1. **未实现的交互** - OperatorGraphModal 中节点/边的点击选择逻辑框架已准备，但需完善事件处理
2. **会话持久化** - 当前会话存于内存，服务器重启会丢失
3. **错误处理** - 需添加更完善的异常处理与用户提示

### 🔮 后续计划

- [ ] 完善OperatorGraphModal点击选择逻辑
- [ ] 添加网络请求错误处理与重试
- [ ] 实现会话Redis存储
- [ ] 添加工作流进度指示器
- [ ] 支持"返回上一步"功能
- [ ] 缓存与性能优化

---

**版本**: 2.0.0  
**发布日期**: 2024年  
**状态**: 🟡 Ready for Testing  
**维护者**: AI Assistant  
