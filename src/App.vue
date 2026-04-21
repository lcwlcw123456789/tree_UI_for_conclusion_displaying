<script setup lang="ts">
import { computed, ref } from 'vue'
import StartPage from './components/StartPage.vue'
import DocumentView from './components/DocumentView.vue'
import DynamicResultView from './components/DynamicResultView.vue'
import type { IntermediateResult } from './types/intermediate'
import type { FinalConclusion } from './types/conclusion'
import type { OperatorView } from './types/operator'

type Step = 'select' | 'document' | 'result'

const currentStep = ref<Step>('select')
const selectedCompanyId = ref<string | null>(null)
const documentStructure = ref<any | null>(null)
const uploadLogs = ref<string[]>([])

const qaIntermediate = ref<IntermediateResult | null>(null)
const qaConclusion = ref<FinalConclusion | null>(null)
const qaOperatorView = ref<OperatorView | null>(null)
const qaLogs = ref<string[]>([])
const qaSessionId = ref<string | null>(null)
const qaWorkflowPhase = ref<'operator_select' | 'path_select' | 'final'>('final')

const stepIndex = computed(() => {
  switch (currentStep.value) {
    case 'select':
      return 1
    case 'document':
      return 2
    case 'result':
      return 3
    default:
      return 1
  }
})

const progressPercent = computed(() => {
  switch (currentStep.value) {
    case 'select':
      return 33
    case 'document':
      return 66
    case 'result':
      return 100
    default:
      return 0
  }
})

function handleCompanyReady(payload: { companyId: string; structure: any; uploadLogs?: string[] }) {
  selectedCompanyId.value = payload.companyId
  documentStructure.value = payload.structure
   uploadLogs.value = payload.uploadLogs ?? []
  currentStep.value = 'document'
}

function handleQuestionComplete(payload: {
  intermediate: IntermediateResult
  conclusion: FinalConclusion
  operatorView?: OperatorView | null
  logs?: string[]
  qaSessionId?: string | null
  workflowPhase?: 'operator_select' | 'path_select' | 'final'
}) {
  qaIntermediate.value = payload.intermediate
  qaConclusion.value = payload.conclusion
  qaOperatorView.value = payload.operatorView ?? null
  qaLogs.value = payload.logs ?? []
  qaSessionId.value = payload.qaSessionId ?? null
  qaWorkflowPhase.value = payload.workflowPhase ?? 'final'
  currentStep.value = 'result'
}

function backToDocument() {
  if (selectedCompanyId.value) {
    currentStep.value = 'document'
  } else {
    currentStep.value = 'select'
  }
}

function backToStart() {
  currentStep.value = 'select'
}

function backToLastResult() {
  if (qaIntermediate.value && qaConclusion.value) {
    currentStep.value = 'result'
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-title-block">
        <h1 class="app-title">Cross-Modal Document Insight</h1>
        <p class="app-subtitle">跨模态文档洞察与问答系统</p>
      </div>
      <div class="stepper">
        <div class="step" :class="{ active: stepIndex >= 1 }">
          <span class="step-index">1</span>
          <span class="step-label">选择 / 上传文档</span>
        </div>
        <div class="step-line" :class="{ active: stepIndex >= 2 }" />
        <div class="step" :class="{ active: stepIndex >= 2 }">
          <span class="step-index">2</span>
          <span class="step-label">文档与指标浏览</span>
        </div>
        <div class="step-line" :class="{ active: stepIndex >= 3 }" />
        <div class="step" :class="{ active: stepIndex >= 3 }">
          <span class="step-index">3</span>
          <span class="step-label">问答与推理结果</span>
        </div>
      </div>
      <div class="header-progress">
        <div class="header-progress-track">
          <div
            class="header-progress-bar"
            :style="{ width: progressPercent + '%' }"
          />
        </div>
      </div>
    </header>

    <main class="app-main">
      <StartPage
        v-if="currentStep === 'select'"
        @ready="handleCompanyReady"
      />

      <DocumentView
        v-else-if="currentStep === 'document' && selectedCompanyId"
        :company-id="selectedCompanyId"
        :initial-structure="documentStructure"
        :upload-logs="uploadLogs"
        :can-open-last-result="!!qaIntermediate && !!qaConclusion"
        @back="backToStart"
        @question-complete="handleQuestionComplete"
        @open-last-result="backToLastResult"
      />

      <section v-else-if="currentStep === 'result' && qaIntermediate && qaConclusion" class="result-section">
        <div class="result-toolbar">
          <button class="ghost-button" type="button" @click="backToDocument">
            ← 返回文档
          </button>
          <div class="logs-summary" v-if="qaLogs.length">
            后端执行步骤：{{ qaLogs.length }} 条
          </div>
        </div>
        <DynamicResultView
          :intermediate="qaIntermediate"
          :conclusion="qaConclusion"
          :operator-view="qaOperatorView"
          :qa-session-id="qaSessionId"
          :workflow-phase="qaWorkflowPhase"
        />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.app-header {
  padding: 0.9rem 1.5rem 1.4rem;
  border-bottom: 1px solid var(--color-border);
  background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 55%),
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.12), transparent 50%),
    rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.app-title-block {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.app-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
}

.app-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.step-index {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  background: #ffffff;
}

.step-label {
  white-space: nowrap;
}

.step-line {
  flex: 1;
  height: 2px;
  background: var(--color-border);
  border-radius: 999px;
}

.step.active {
  color: var(--color-primary);
}

.step.active .step-index {
  border-color: var(--color-primary);
  background: var(--color-accent-light);
}

.step-line.active {
  background: var(--color-primary);
}

.header-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 1.5rem 0.25rem;
}

.header-progress-track {
  width: 100%;
  height: 3px;
  border-radius: 999px;
  background: var(--color-bg-muted);
  overflow: hidden;
}

.header-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  border-radius: 999px;
  transition: width 0.3s ease;
}

.app-main {
  flex: 1;
  min-height: 0;
}

.result-section {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.result-toolbar {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: var(--color-bg-panel);
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

.logs-summary {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
