<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useBackend } from '../composables/useBackend'

const props = defineProps<{
  companyId: string
  initialStructure?: any | null
  uploadLogs?: string[]
  canOpenLastResult?: boolean
}>()

const emit = defineEmits<{
  back: []
  openLastResult: []
  questionComplete: [payload: {
    intermediate: any
    conclusion: any
    operatorView?: any
    logs?: string[]
    qaSessionId?: string | null
    workflowPhase?: 'operator_select' | 'path_select' | 'final'
  }]
}>()

const { get, postJsonWithSignal, buildUrl } = useBackend()

const structure = ref<any | null>(props.initialStructure ?? null)
const loadingStructure = ref(false)
const error = ref<string | null>(null)

const activePillarName = ref<string | null>(null)
const hoveredPillarName = ref<string | null>(null)

const hoveredIndicatorIndex = ref<number | null>(null)

const currentPdfPage = ref<number | null>(null)
const activeTableIndex = ref<number | null>(null)

const question = ref('')
const asking = ref(false)
const askLogs = ref<string[]>([])
const qaController = ref<AbortController | null>(null)

const pdfUrl = computed(() => {
  if (!structure.value || !structure.value.pdf_url) return null
  const base = buildUrl(structure.value.pdf_url)
  const page = currentPdfPage.value
  if (page && page > 0) {
    const sep = base.includes('?') ? '&' : '?'
    // 同时加上 query 和 hash，尽量兼容不同浏览器 / 查看器
    return `${base}${sep}page=${page}#page=${page}`
  }
  return base
})

const pillars = computed(() => structure.value?.pillars ?? [])

const indicatorsForActivePillar = computed(() => {
  if (!structure.value) return []
  const pillarName = activePillarName.value
  if (!pillarName) return []
  const map = structure.value.pillar_indicators || {}
  return map[pillarName] || []
})

const hasQuestionResult = ref(false)

// 静态示例：当输入 0~4 时，直接从前端 public/data* 目录加载对应的中间结果与结论 JSON
const DEMO_FILES: Record<
  number,
  {
    intermediateCandidates: string[]
    conclusionCandidates: string[]
    operatorCandidates?: string[]
    label: string
  }
> = {
  0: {
    intermediateCandidates: [
      '/data/denoised_traceable_report.json',
      '/data/final_qed_with_retrieval_meta.json',
    ],
    conclusionCandidates: [
      '/data/final_conclusion_labeled.json',
      '/data/final_conclusion_meta_labeled.json',
    ],
    operatorCandidates: ['/data/pillar_operator_view.json'],
    label: 'Meta 示例',
  },
  1: {
    // data_1 已切换为后端新格式样例
    intermediateCandidates: [
      '/data_1/denoised_traceable_report.json',
      '/data_1/final_qed_with_retrieval_apple.json',
    ],
    conclusionCandidates: [
      '/data_1/final_conclusion_labeled.json',
      '/data_1/final_conclusion_apple_labeled.json',
    ],
    operatorCandidates: ['/data_1/pillar_operator_view.json'],
    label: 'Apple 示例',
  },
  2: {
    intermediateCandidates: [
      '/data_2/denoised_traceable_report.json',
      '/data_2/final_qed_with_retrieval_microsoft.json',
    ],
    conclusionCandidates: [
      '/data_2/final_conclusion_labeled.json',
      '/data_2/final_conclusion_microsoft_labeled.json',
    ],
    operatorCandidates: ['/data_2/pillar_operator_view.json'],
    label: 'Microsoft 示例 A',
  },
  3: {
    intermediateCandidates: [
      '/data_3/denoised_traceable_report.json',
      '/data_3/final_qed_with_retrieval_microsoft.json',
    ],
    conclusionCandidates: [
      '/data_3/final_conclusion_labeled.json',
      '/data_3/final_conclusion_microsoft_labeled.json',
    ],
    operatorCandidates: ['/data_3/pillar_operator_view.json'],
    label: 'Microsoft 示例 B',
  },
  4: {
    intermediateCandidates: [
      '/data_4/denoised_traceable_report.json',
      '/data_4/final_qed_with_retrieval.json',
    ],
    conclusionCandidates: ['/data_4/final_conclusion_labeled.json'],
    operatorCandidates: ['/data_4/pillar_operator_view.json'],
    label: '通用示例',
  },
}

async function fetchFirstAvailableJson(candidates: string[]) {
  let lastErr = ''
  for (const p of candidates) {
    try {
      const r = await fetch(p)
      if (!r.ok) {
        lastErr = `${p}: ${r.status}`
        continue
      }
      return {
        path: p,
        data: await r.json(),
      }
    } catch (e: any) {
      lastErr = `${p}: ${e?.message || 'unknown error'}`
    }
  }
  throw new Error(`候选文件均加载失败：${lastErr}`)
}

const uploadLogsComputed = computed(() => props.uploadLogs ?? [])
const showPipelineStatus = computed(
  () => uploadLogsComputed.value.length > 0 || askLogs.value.length > 0 || asking.value,
)
const qaProgressPercent = computed(() => {
  if (asking.value) return 60
  if (askLogs.value.length > 0) return 100
  return 0
})

type LogLevel = 'info' | 'stage' | 'error'

function classifyLog(line: string): LogLevel {
  const lower = line.toLowerCase()
  if (lower.includes('processing pillar') || lower.includes('[processing pillar')) return 'stage'
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error'
  return 'info'
}

const qaLogItems = computed(() =>
  askLogs.value.map((line) => ({
    text: line,
    level: classifyLog(line),
  })),
)

const uploadLogItems = computed(() =>
  uploadLogsComputed.value.map((line) => ({
    text: line,
    level: classifyLog(line),
  })),
)

const qaLogListRef = ref<HTMLElement | null>(null)

watch(
  () => askLogs.value.length,
  async () => {
    await nextTick()
    const el = qaLogListRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  },
)

async function loadStructureIfNeeded() {
  if (structure.value) return
  loadingStructure.value = true
  error.value = null
  try {
    const data = await get<any>(`/api/document/${props.companyId}/structure`)
    structure.value = data
    if (data.pillars && data.pillars.length) {
      activePillarName.value = data.pillars[0].pillar_name
    }
  } catch (e: any) {
    error.value = e?.message || '加载文档结构失败'
  } finally {
    loadingStructure.value = false
  }
}

onMounted(() => {
  console.log('[document-view] mounted with companyId', props.companyId)
  if (structure.value && structure.value.pillars?.length) {
    activePillarName.value = structure.value.pillars[0].pillar_name
  } else {
    loadStructureIfNeeded()
  }
})

watch(
  () => structure.value,
  (val: any) => {
    if (val) {
      console.log('[document-view] structure loaded', val)
      console.log('[document-view] pdf_url from structure', val.pdf_url)
    }
  },
  { deep: true }
)

watch(
  () => pdfUrl.value,
  (val: string | null) => {
    console.log('[document-view] computed pdfUrl', val)
  }
)

async function sendQuestion() {
  const text = question.value.trim()
  if (!text || asking.value) return

  // 如果是 0~4 的快捷键，走前端静态示例逻辑：
  // 直接从 public/data* 目录加载对应的 final_qed_with_retrieval + final_conclusion JSON
  if (/^[0-4]$/.test(text)) {
    const idx = Number(text)
    const files = DEMO_FILES[idx]
    if (!files) return

    asking.value = true
    error.value = null
    askLogs.value = [`前端静态示例：捕获到快捷键 ${idx}（${files.label}），开始按候选路径加载结果。`]
    hasQuestionResult.value = false

    try {
      const [intermediateResult, conclusionResult] = await Promise.all([
        fetchFirstAvailableJson(files.intermediateCandidates),
        fetchFirstAvailableJson(files.conclusionCandidates),
      ])

      askLogs.value.push(`静态 intermediate: ${intermediateResult.path}`)
      askLogs.value.push(`静态 conclusion: ${conclusionResult.path}`)

      let operatorView: any = null
      if (files.operatorCandidates && files.operatorCandidates.length) {
        try {
          const operatorResult = await fetchFirstAvailableJson(files.operatorCandidates)
          operatorView = operatorResult.data
          askLogs.value.push(`静态 operator_view: ${operatorResult.path}`)
        } catch {
          // 算子文件可选，不阻断主流程
          askLogs.value.push('静态 operator_view: 未找到，继续使用结论与中间结果。')
        }
      }

      hasQuestionResult.value = true
      emit('questionComplete', {
        intermediate: intermediateResult.data,
        conclusion: conclusionResult.data,
        operatorView,
        logs: askLogs.value,
        qaSessionId: `static-${idx}`,
        workflowPhase: 'operator_select',
      })
    } catch (e: any) {
      error.value = e?.message || '加载示例结果失败'
    } finally {
      asking.value = false
    }

    return
  }
  asking.value = true
  error.value = null
  askLogs.value = []
  hasQuestionResult.value = false

  // 如果之前有未完成的请求，先中止
  if (qaController.value) {
    qaController.value.abort()
  }

  const controller = new AbortController()
  qaController.value = controller

  try {
    const res = await postJsonWithSignal<any>(
      '/api/qa',
      {
        company_id: props.companyId,
        question: text,
      },
      controller.signal,
    )
    askLogs.value = res.logs || []
    hasQuestionResult.value = true
    emit('questionComplete', {
      intermediate: res.intermediate,
      conclusion: res.conclusion,
      operatorView: res.pillar_operator_view ?? null,
      logs: res.logs,
      qaSessionId: res.qa_session_id ?? null,
      workflowPhase: res.workflow_phase ?? 'operator_select',
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      // 主动取消时不认为是错误
      console.log('[document-view] QA request aborted')
    } else {
      error.value = e?.message || '问答管线执行失败'
    }
  } finally {
    asking.value = false
  }
}

function handleBack() {
  // 如果有在进行的问答请求，主动取消
  if (qaController.value) {
    qaController.value.abort()
    qaController.value = null
  }
  asking.value = false
  emit('back')
}

function handlePillarHover(name: string | null) {
  hoveredPillarName.value = name
}

function handleIndicatorHover(index: number | null) {
  hoveredIndicatorIndex.value = index
}

function jumpToPdfPage(page: number | null | undefined) {
  if (!page || page <= 0) return
  if (!structure.value || !structure.value.pdf_url) return
  currentPdfPage.value = page
}

function handleIndicatorClick(ind: any, index?: number) {
  jumpToPdfPage(ind?.source_page)
  if (ind?.is_table || ind?.indicator_type === 'super_table') {
    const key = typeof index === 'number' ? index : null
    if (activeTableIndex.value === key) {
      activeTableIndex.value = null
    } else {
      activeTableIndex.value = key
    }
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendQuestion()
  }
}
</script>

<template>
  <section class="doc-view">
    <div class="toolbar">
      <button type="button" class="ghost-button" @click="handleBack">
        ← 返回选择
      </button>
      <div class="toolbar-right">
        <span class="company-tag">{{ props.companyId }}</span>
        <button
          v-if="props.canOpenLastResult"
          type="button"
          class="ghost-button"
          @click="emit('openLastResult')"
        >
          查看上次问答结果
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="!hasQuestionResult"
          @click="emit('questionComplete', $event as any)"
          style="display: none;"
        >
          <!-- 结果由父级在 questionComplete 时跳转，这里按钮仅占位 -->
          查看推理结果
        </button>
      </div>
    </div>

    <div class="content" v-if="!loadingStructure && structure">
      <div class="panels">
        <div class="panel pdf-panel">
          <h3 class="panel-title">原始 PDF</h3>
          <div class="panel-body pdf-body">
            <div v-if="pdfUrl" class="pdf-frame-wrapper">
              <iframe
                :src="pdfUrl"
                class="pdf-frame"
                title="Document PDF"
              />
            </div>
            <p v-else class="hint-text">未找到对应 PDF 文件，仅支持结构化浏览与问答。</p>
          </div>
        </div>

        <div class="panel pillar-panel">
          <h3 class="panel-title">分析 Pillar</h3>
          <div class="panel-body pillar-list">
            <button
              v-for="p in pillars"
              :key="p.pillar_name"
              type="button"
              class="pillar-item"
              :class="{ active: p.pillar_name === activePillarName, hovered: p.pillar_name === hoveredPillarName }"
              @click="activePillarName = p.pillar_name"
              @mouseenter="handlePillarHover(p.pillar_name)"
              @mouseleave="handlePillarHover(null)"
            >
              <div class="pillar-name">{{ p.pillar_name }}</div>
              <div class="pillar-def">{{ p.definition }}</div>
              <div class="pillar-meta">
                <span>关联页码：{{ p.associated_pages.join(', ') }}</span>
                <span>指标数：{{ p.indicator_count }}</span>
              </div>
            </button>
          </div>
        </div>

        <div class="panel indicator-panel">
          <h3 class="panel-title">对应 Indicator</h3>
          <div class="panel-body indicator-list">
            <template v-if="indicatorsForActivePillar.length">
              <div
                v-for="(ind, i) in indicatorsForActivePillar"
                :key="i"
                class="indicator-item"
                :class="{ hovered: i === hoveredIndicatorIndex, 'is-table': ind.is_table || ind.indicator_type === 'super_table' }"
                @click="handleIndicatorClick(ind, i as number)"
                @mouseenter="handleIndicatorHover(i as number)"
                @mouseleave="handleIndicatorHover(null)"
              >
                <div class="indicator-name">
                  {{ ind.indicator_name }}
                </div>
                <div class="indicator-meta">
                  <span class="meta-link" @click.stop="jumpToPdfPage(ind.source_page)">
                    来源页：{{ ind.source_page }}
                  </span>
                  <span v-if="ind.is_table || ind.indicator_type === 'super_table'" class="badge-table">表格</span>
                  <span v-else-if="ind.is_quantitative">定量</span>
                  <span v-else>定性</span>
                </div>
                <template v-if="ind.is_table || ind.indicator_type === 'super_table'">
                  <div class="table-summary">
                    <div class="table-tags">
                      <span class="tag">行数：{{ (ind.sub_indicators && ind.sub_indicators.length) || 0 }}</span>
                    </div>
                    <div v-if="ind.table_schema && ind.table_schema.length" class="table-columns">
                      <span
                        v-for="(col, idx) in ind.table_schema.slice(0, 4)"
                        :key="idx"
                        class="col-chip"
                      >
                        {{ col }}
                      </span>
                      <span
                        v-if="ind.table_schema.length > 4"
                        class="col-more"
                      >
                        +{{ ind.table_schema.length - 4 }}
                      </span>
                    </div>
                    <div
                      v-if="activeTableIndex === i && ind.sub_indicators && ind.table_schema && ind.table_schema.length"
                      class="table-detail"
                    >
                      <div class="table-detail-scroll">
                        <table class="mini-table">
                          <thead>
                            <tr>
                              <th
                                v-for="col in ind.table_schema"
                                :key="col"
                              >
                                {{ col }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr
                              v-for="(row, rIdx) in ind.sub_indicators"
                              :key="rIdx"
                            >
                              <td
                                v-for="col in ind.table_schema"
                                :key="col"
                              >
                                {{ row.values && row.values[col] }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </template>
                <p v-else-if="ind.relevance_rationale" class="indicator-rationale">
                  {{ ind.relevance_rationale }}
                </p>
              </div>
            </template>
            <p v-else class="hint-text">
              该 Pillar 下暂未匹配到文本 indicator，或仅包含表格型指标。
            </p>
          </div>
        </div>
      </div>

      <div v-if="showPipelineStatus" class="pipeline-status">
        <div class="pipeline-header">
          <div class="pipeline-title">处理进度</div>
          <div class="pipeline-bar">
            <div
              class="pipeline-bar-inner"
              :class="{ indeterminate: asking }"
              :style="!asking ? { width: qaProgressPercent + '%' } : {}"
            />
          </div>
        </div>
        <div class="pipeline-logs">
          <div v-if="uploadLogsComputed.length" class="log-block">
            <h4 class="log-title">上传 / 预处理日志</h4>
            <ul class="log-list">
              <li
                v-for="(item, i) in uploadLogItems"
                :key="'u-' + i"
                class="log-line"
                :class="item.level"
              >
                <span class="log-dot" />
                <span class="log-text">{{ item.text }}</span>
              </li>
            </ul>
          </div>
          <div v-if="askLogs.length" class="log-block">
            <h4 class="log-title">问答管线日志</h4>
            <ul ref="qaLogListRef" class="log-list">
              <li
                v-for="(item, i) in qaLogItems"
                :key="'q-' + i"
                class="log-line"
                :class="item.level"
              >
                <span class="log-dot" />
                <span class="log-text">{{ item.text }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="qa-panel">
        <div class="qa-header">
          <div class="qa-title-block">
            <h3>就当前文档提问</h3>
            <p class="hint-text">问题可以是复杂的非事实性问题，系统会自动拆分并检索证据。</p>
          </div>
          <div class="qa-status" v-if="asking">
            <div class="spinner" />
            <span>后端正在运行问答管线…</span>
          </div>
        </div>
        <div class="qa-input-wrapper">
          <textarea
            v-model="question"
            class="qa-input"
            rows="2"
            placeholder="例如：总结本公司未来三年的关键增长驱动，并分点分析主要风险。按 Enter 发送，Shift+Enter 换行。输入 0~4 可直接查看不同公司的示例结果。"
            @keydown="handleKeydown"
          />
          <button
            type="button"
            class="primary-button send-button"
            :disabled="!question.trim() || asking"
            @click="sendQuestion"
          >
            {{ asking ? '思考中…' : '发送问题' }}
          </button>
        </div>
        <p v-if="error" class="error-text">{{ error }}</p>
      </div>
    </div>

    <div v-else class="loading-state">
      <div class="spinner" />
      <p>正在加载文档结构...</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.doc-view {
  height: calc(100vh - 72px);
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.toolbar {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.company-tag {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--color-bg-muted);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.ghost-button {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.ghost-button:hover {
  background: var(--color-bg-hover);
  transform: translateY(-0.5px);
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
}

.primary-button {
  border-radius: 999px;
  border: none;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  cursor: pointer;
  background: var(--color-primary);
  color: white;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.primary-button:not(:disabled) {
  transition: background 0.15s ease, transform 0.12s ease, box-shadow 0.12s ease;
}

.primary-button:not(:disabled):hover {
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.28);
  transform: translateY(-0.5px);
}

.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panels {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.2fr;
  grid-auto-rows: 1fr;
  gap: 0.75rem;
  padding: 0.75rem 0.75rem 0.25rem;
}

.panel {
  background: var(--color-bg-panel);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.panel-title {
  margin: 0;
  padding: 0.55rem 0.75rem;
  font-size: 0.9rem;
  border-bottom: 1px solid var(--color-border);
}

.panel-body {
  padding: 0.5rem 0.75rem 0.75rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.pdf-body {
  padding: 0;
}

.pdf-frame-wrapper {
  height: 100%;
}

.pdf-frame {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 0 0 10px 10px;
}

.pillar-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.pillar-item {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.45rem 0.5rem;
  text-align: left;
  background: var(--color-bg-muted);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease, box-shadow 0.12s ease;
}

.pillar-item.active {
  border-color: var(--color-primary);
  background: var(--color-accent-light);
  transform: translateY(-1px);
}

.pillar-item.hovered:not(.active) {
  border-color: var(--color-accent);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.18);
}

.pillar-name {
  font-size: 0.9rem;
  font-weight: 600;
}

.pillar-def {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-top: 0.15rem;
}

.pillar-meta {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  display: flex;
  justify-content: space-between;
  color: var(--color-text-muted);
}

.indicator-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.indicator-item {
  border-radius: 8px;
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.5rem;
  background: var(--color-bg-muted);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease, box-shadow 0.12s ease;
  cursor: pointer;
}

.indicator-name {
  font-size: 0.85rem;
  font-weight: 500;
}

.indicator-meta {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  justify-content: space-between;
}

.meta-link {
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
}

.meta-link:hover {
  color: var(--color-primary);
}

.badge-table {
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  font-size: 0.7rem;
  color: var(--color-primary);
  background: var(--color-accent-light);
}

.indicator-item.is-table {
  border-style: dashed;
}

.table-summary {
  margin-top: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.table-tags {
  display: flex;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.tag {
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: var(--color-bg-panel);
}

.table-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.col-chip {
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: var(--color-bg-panel);
  font-size: 0.7rem;
}

.col-more {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.table-detail {
  margin-top: 0.3rem;
}

.table-detail-scroll {
  max-height: 140px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-panel);
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.mini-table th,
.mini-table td {
  padding: 0.2rem 0.35rem;
  border-bottom: 1px solid var(--color-border);
}

.mini-table thead {
  background: var(--color-bg-muted);
}

.indicator-rationale {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.indicator-item.hovered {
  border-color: var(--color-primary);
  background: var(--color-accent-light);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.2);
  transform: translateY(-1px);
}

.pipeline-status {
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-panel);
  padding: 0.45rem 0.85rem 0.6rem;
}

.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}

.pipeline-title {
  font-size: 0.85rem;
  font-weight: 500;
}

.pipeline-bar {
  flex: 1;
  margin-left: 1rem;
  height: 4px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  overflow: hidden;
}

.pipeline-bar-inner {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  border-radius: 999px;
  transition: width 0.25s ease;
}

.pipeline-bar-inner.indeterminate {
  width: 40%;
  animation: pipeline-indeterminate 1s ease-in-out infinite;
}

.pipeline-logs {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.log-block {
  flex: 1;
  min-width: 0;
  border-radius: 8px;
  background: var(--color-bg-muted);
  padding: 0.45rem 0.6rem;
}

.log-title {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
}

.log-list {
  margin: 0;
  padding-left: 1rem;
  max-height: 220px;
  overflow-y: auto;
  font-size: 0.85rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.log-line {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin-bottom: 0.15rem;
}

.log-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  margin-top: 0.3rem;
  background: var(--color-text-muted);
}

.log-line.stage .log-dot {
  background: var(--color-primary);
}

.log-line.error .log-dot {
  background: #dc2626;
}

.log-text {
  white-space: pre-wrap;
}

.qa-panel {
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-panel);
  padding: 0.85rem 1rem 1rem;
  box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.14);
}

.qa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.qa-title-block h3 {
  margin: 0;
  font-size: 0.95rem;
}

.qa-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.qa-input {
  flex: 1;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.6rem;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 2.2rem;
  background: var(--color-bg-muted);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.qa-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary), 0 8px 20px rgba(37, 99, 235, 0.25);
  background: #ffffff;
}

.send-button {
  align-self: stretch;
}

.hint-text {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.demo-text {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: var(--color-accent);
}

.error-text {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  color: #dc2626;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.spinner {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  animation: spin 0.8s linear infinite;
}

.qa-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pipeline-indeterminate {
  0% {
    transform: translateX(-50%);
  }
  50% {
    transform: translateX(20%);
  }
  100% {
    transform: translateX(120%);
  }
}
</style>
