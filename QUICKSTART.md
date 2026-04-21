# 交互式多阶段问答流程 - 快速开始指南

## 系统概述

本系统实现了一个**交互式三阶段问答流程**：

1. **第一阶段 (operator_select)** - 用户查看和选择算子
2. **第二阶段 (path_select)** - 用户选择推理路径
3. **第三阶段 (final)** - 展示最终结论

用户可以在中途介入，定制使用的算子和推理逻辑，获得更精准的答案。

---

## 快速部署

### 前置条件

- **后端**: Python 3.8+, FastAPI, OpenAI API
- **前端**: Node.js 14+, npm/pnpm

### 部署步骤

#### 1️⃣ 后端启动

```bash
cd /path/to/project/backend

# 安装依赖
pip install fastapi pydantic openai python-multipart

# 启动服务
python api_server.py
# 预期输出: Uvicorn running on http://127.0.0.1:8000

# 验证健康状态
curl http://127.0.0.1:8000/health
```

#### 2️⃣ 前端启动

```bash
cd /path/to/project/CWNFRAG-ui

# 安装依赖
npm install
# 或
pnpm install

# 启动开发服务
npm run dev
# 预期输出: VITE v[x.x.x] ready in [x] ms
#          ➜  Local:   http://localhost:5173/
```

#### 3️⃣ 打开浏览器

访问 `http://localhost:5173`

---

## 快速测试

### 方式 1: 静态示例 (快速验证)

1. 打开应用
2. 在问题框输入 **0** (或 1-4)
3. 按 Enter
4. 应该直接显示最终结论（数据从本地 JSON 加载）

这个方式不需要后端运行，适合快速验证前端功能。

### 方式 2: 完整交互流程 (完整测试)

1. 确保后端服务正在运行
2. 打开应用
3. 在问题框输入实际问题，例如: "公司的财务状况如何？"
4. 按 Enter
5. 等待显示 **OperatorGraphModal** (算子选择界面)
6. 点击 "确认选择的算子" 按钮
7. 等待显示 **Stage3GraphModal** (路径选择界面)
8. 选择一条路径，点击 "确认选择此路径" 按钮
9. 最后显示 **ConclusionPanel** (最终答案)

详见 [TESTING_GUIDE.md](./TESTING_GUIDE.md) 获取详细步骤。

---

## 文件导航

### 📚 文档

| 文件 | 用途 | 对象 |
|------|------|------|
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | 完整的系统架构与实现细节 | 开发者 |
| [TESTING_GUIDE.md](./TESTING_GUIDE.md) | 详细的测试指南与调试技巧 | 测试/开发者 |
| [FINAL_REPORT.md](./FINAL_REPORT.md) | 项目完成报告与后续改进建议 | 项目经理/技术负责人 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新日志 | 所有人 |
| [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) | 实现完成检查清单 | 开发者 |

### 🔧 后端代码

```
backend/
├── api_server.py              # FastAPI服务主文件
│   ├── /api/qa                # 第一阶段：算子提取
│   ├── /api/qa/operators/submit # 第二阶段：路径规划
│   └── /api/qa/path/submit    # 第三阶段：答案生成
└── generation_pipeline.py     # 核心算法实现
    ├── extract_operator_view()         # Stage 1
    ├── apply_operator_selection()      # 过滤
    ├── generate_pillar_results()       # Stage 2
    ├── _plan_synthesis_paths()         # 路径规划
    └── write_final_answer_with_path()  # Stage 3
```

### 🎨 前端代码

```
src/
├── types/operator.ts          # 算子数据类型定义
├── App.vue                    # 顶层容器，工作流状态管理
├── components/
│   ├── DocumentView.vue       # 问题提交与静态示例
│   ├── DynamicResultView.vue  # 结果展示主容器
│   ├── TreePanel/
│   │   └── OperatorGraphModal.vue # 算子选择UI (operator_select)
│   └── ConclusionPanel/
│       ├── ConclusionPanel.vue    # 工作流UI容器
│       └── Stage3GraphModal.vue   # 路径选择UI (path_select)
└── public/data*/              # 静态示例数据
```

---

## 关键概念

### 会话 (Session)

每个问题生成一个唯一的 `qa_session_id` (UUID)，用于跟踪整个交互过程：

```
qa_session_id: "a1b2c3d4e5f6..."
  ├─ 原始问题与输入数据
  ├─ 提取的算子项
  ├─ 用户选择的算子
  ├─ 生成的段落与路径
  └─ 最终答案
```

### 工作流阶段 (Workflow Phase)

```
operator_select  →  path_select  →  final
  ↑                  ↑               ↑
阶段1            阶段2           阶段3
```

### 算子键 (Operator Key)

每个算子项被赋予唯一标识 `operator_key`：

```
operator_key: "0|Financial|causal_anchoring|2"
              │ │         │                  └─ 项目索引
              │ │         └─ 算子类型
              │ └─ Pillar名称
              └─ Pillar索引
```

---

## 常见操作

### ❓ 如何查看已选的算子？

1. 在 `operator_select` 阶段
2. 点击 "查看已选" 按钮
3. 弹窗显示所有已选算子的 `operator_key` 列表

### ❓ 如何改变选择的算子？

当前实现支持基础的算子选择UI。点击节点/边来选择/取消选择（逻辑框架已准备）。

注：`entity_alignment` 类型的算子强制全选，无法取消选择。

### ❓ 如何跳过算子选择直接看最终答案？

使用静态示例模式（输入 0-4），直接加载本地数据，跳过所有交互阶段。

### ❓ 如何调试API调用？

1. 打开浏览器 DevTools (F12)
2. 切换到 Network 标签
3. 查看 `/api/qa*` 的请求和响应
4. 检查 Request Body 和 Response Body

### ❓ 如何查看后端日志？

后端服务的日志会直接输出到控制台，包含：
- API端点请求记录
- Stage执行进度
- 错误堆栈跟踪

---

## 故障排查

### ❌ 问题: "无法连接到后端"

**原因**: 后端服务未运行或地址配置错误

**解决方案**:
```bash
# 1. 检查后端是否运行
curl http://127.0.0.1:8000/health

# 2. 检查前端 .env 文件中的后端地址配置
# 应该指向正确的后端URL

# 3. 如果跨域错误，检查后端的CORS配置
```

### ❌ 问题: "工作流卡在某个阶段"

**原因**: API响应缓慢或出错

**解决方案**:
```javascript
// 在浏览器控制台检查
console.log(window.__VITE_GLOBAL_STATE__)  // 查看当前状态

// 检查网络请求
// DevTools → Network 标签 → 查看最后的请求状态
```

### ❌ 问题: "算子列表为空"

**原因**: 后端提取阶段出错或模型配置有问题

**解决方案**:
- 检查后端日志获取具体错误信息
- 确保OpenAI API密钥配置正确
- 尝试使用静态示例验证前端功能

### ❌ 问题: "无法提交选择"

**原因**: 未选择任何算子或网络问题

**解决方案**:
- 确保已选择至少一个算子（通常entity_alignment会自动全选）
- 检查网络连接
- 查看浏览器控制台是否有JavaScript错误

更详细的故障排查见 [TESTING_GUIDE.md](./TESTING_GUIDE.md#常见问题排查)

---

## 集成检查清单

- [ ] 后端 `api_server.py` 能正常启动
- [ ] 前端开发服务能正常启动
- [ ] 静态示例 (快捷键0-4) 能正常加载
- [ ] `/api/qa` 端点正常响应
- [ ] OperatorGraphModal 在 `operator_select` 阶段显示
- [ ] `/api/qa/operators/submit` 端点正常工作
- [ ] Stage3GraphModal 在 `path_select` 阶段显示
- [ ] `/api/qa/path/submit` 端点正常工作
- [ ] 最终答案在 `final` 阶段正确展示

---

## 下一步

1. **立即**: 运行部署步骤，启动应用
2. **快速测试**: 使用静态示例 (输入 0-4)
3. **完整测试**: 测试交互式三阶段流程
4. **深入理解**: 阅读 [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
5. **集成开发**: 根据 [TESTING_GUIDE.md](./TESTING_GUIDE.md) 进行扩展开发

---

## 获取帮助

### 📖 文档

- **系统架构** → [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **测试指南** → [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- **项目报告** → [FINAL_REPORT.md](./FINAL_REPORT.md)
- **更新日志** → [CHANGELOG.md](./CHANGELOG.md)

### 🐛 常见问题

见 [TESTING_GUIDE.md](./TESTING_GUIDE.md#常见问题排查)

### 💬 反馈

遇到问题或有改进建议？
- 检查日志输出获取具体错误信息
- 参考相关文档确认配置正确
- 提交问题时附上错误日志和截图

---

**版本**: v2.0.0  
**最后更新**: 2024年  
**状态**: 🟢 Ready for Testing

祝您使用愉快！🚀
