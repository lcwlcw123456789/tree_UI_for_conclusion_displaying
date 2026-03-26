<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useBackend } from '../composables/useBackend'

const props = defineProps<{
  companyId: string
  initialStructure?: any | null
}>()

const emit = defineEmits<{
  back: []
  questionComplete: [payload: { intermediate: any; conclusion: any; logs?: string[] }]
}>()

const { get, postJson, buildUrl } = useBackend()

const structure = ref<any | null>(props.initialStructure ?? null)
const loadingStructure = ref(false)
const error = ref<string | null>(null)

const activePillarName = ref<string | null>(null)

const question = ref('')
const asking = ref(false)
const askLogs = ref<string[]>([])

const pdfUrl = computed(() => {
  if (!structure.value || !structure.value.pdf_url) return null
  return buildUrl(structure.value.pdf_url)
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
  asking.value = true
  error.value = null
  askLogs.value = []
  hasQuestionResult.value = false

  try {
    const res = await postJson<any>('/api/qa', {
      company_id: props.companyId,
      question: text,
    })
    askLogs.value = res.logs || []
    hasQuestionResult.value = true
    emit('questionComplete', {
      intermediate: res.intermediate,
      conclusion: res.conclusion,
      logs: res.logs,
    })
  } catch (e: any) {
    error.value = e?.message || '问答管线执行失败'
  } finally {
    asking.value = false
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
      <button type="button" class="ghost-button" @click="emit('back')">
        ← 返回选择
      </button>
      <div class="toolbar-right">
        <span class="company-tag">{{ props.companyId }}</span>
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
              :class="{ active: p.pillar_name === activePillarName }"
              @click="activePillarName = p.pillar_name"
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
              >
                <div class="indicator-name">{{ ind.indicator_name }}</div>
                <div class="indicator-meta">
                  <span>来源页：{{ ind.source_page }}</span>
                  <span v-if="ind.is_quantitative">定量</span>
                  <span v-else>定性</span>
                </div>
                <p v-if="ind.relevance_rationale" class="indicator-rationale">
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
            placeholder="例如：Which is more critical for Amazon’s 2026 outlook?..."
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
        <div v-if="askLogs.length" class="log-panel">
          <h4 class="log-title">后端执行日志</h4>
          <ul class="log-list">
            <li v-for="(line, i) in askLogs" :key="i">{{ line }}</li>
          </ul>
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
}

.pillar-item.active {
  border-color: var(--color-primary);
  background: var(--color-accent-light);
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

.indicator-rationale {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.qa-panel {
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-panel);
  padding: 0.65rem 0.85rem 0.85rem;
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
}

.send-button {
  align-self: stretch;
}

.log-panel {
  margin-top: 0.6rem;
  border-radius: 8px;
  background: var(--color-bg-muted);
  padding: 0.5rem 0.6rem;
}

.log-title {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
}

.log-list {
  margin: 0;
  padding-left: 1rem;
  max-height: 120px;
  overflow-y: auto;
  font-size: 0.8rem;
}

.hint-text {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
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
</style>
