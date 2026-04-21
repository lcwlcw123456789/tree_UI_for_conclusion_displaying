<script setup lang="ts">
import { ref, watch } from 'vue'
import type { IntermediateResult } from '../types/intermediate'
import type { FinalConclusion } from '../types/conclusion'
import type { OperatorSelectableItem, OperatorView } from '../types/operator'
import { useIndicatorLink } from '../composables/useIndicatorLink'
import { useBackend } from '../composables/useBackend'
import type { IndicatorKey } from '../composables/useIndicatorLink'
import TreePanel from './TreePanel/TreePanel.vue'
import ConclusionPanel from './ConclusionPanel/ConclusionPanel.vue'

type GraphTab = 'operator' | 'stage3'
type WorkflowPhase = 'operator_select' | 'path_select' | 'final'

const props = defineProps<{
  intermediate: IntermediateResult
  conclusion: FinalConclusion
  operatorView?: OperatorView | null
  qaSessionId?: string | null
  workflowPhase?: WorkflowPhase
}>()

const { postJson } = useBackend()

const intermediateData = ref<IntermediateResult | null>(props.intermediate)
const conclusionData = ref<FinalConclusion | null>(props.conclusion)
const operatorViewData = ref<OperatorView | null>(props.operatorView || null)
const qaSessionId = ref<string | null>(props.qaSessionId ?? null)
const workflowPhase = ref<WorkflowPhase>(props.workflowPhase ?? 'final')

const {
  hoverOnConclusion,
  hoverOffConclusion,
  hoverOnTree,
  hoverOffTree,
  findIndicatorInIntermediate,
  isAnnotationHighlighted,
  isTreeIndicatorHovered,
} = useIndicatorLink(intermediateData, conclusionData)

const indicatorToExpand = ref<IndicatorKey | null>(null)
const showGraphWorkspace = ref(false)
const activeGraphTab = ref<GraphTab>('operator')
const submittingOperator = ref(false)
const submittingPath = ref(false)

const showSelectedOpsPopup = ref(false)
const selectedOpsPreview = ref<OperatorSelectableItem[]>([])

watch(() => props.intermediate, (v) => { intermediateData.value = v })
watch(() => props.conclusion, (v) => { conclusionData.value = v })
watch(() => props.operatorView, (v) => { operatorViewData.value = v || null })
watch(() => props.qaSessionId, (v) => { qaSessionId.value = v ?? null })
watch(() => props.workflowPhase, (v) => {
  workflowPhase.value = v ?? 'final'
})

function isStaticSession() {
  return !!qaSessionId.value && qaSessionId.value.startsWith('static-')
}

function filterOperatorViewByKeys(view: OperatorView | null, selectedKeys: string[]) {
  if (!view) return view
  const selected = new Set(selectedKeys)
  const filtered = {
    ...view,
    operator_results: (view.operator_results || []).map((pillarResult) => {
      const ops = pillarResult.operators || {}
      return {
        ...pillarResult,
        operators: {
          ...ops,
          causal_anchoring: (ops.causal_anchoring || []).filter((x) => !x.operator_key || selected.has(x.operator_key)),
          narrative_relations: (ops.narrative_relations || []).filter((x) => !x.operator_key || selected.has(x.operator_key)),
          entity_alignment: ops.entity_alignment || [],
          conflict_audit: {
            ...(ops.conflict_audit || {}),
            conflicts: ((ops.conflict_audit?.conflicts || []) as any[]).filter((x) => !x.operator_key || selected.has(x.operator_key)),
          },
        },
      }
    }),
  }
  return filtered as OperatorView
}

function handleAnnotationHover(pillarIndex: number, indicatorIds: string[]) {
  hoverOnConclusion(pillarIndex, indicatorIds)
}

function handleAnnotationUnhover() {
  hoverOffConclusion()
}

function handleAnnotationClick(pillarIndex: number, indicatorIds: string[]) {
  const concl = conclusionData.value
  if (!concl || pillarIndex >= concl.pillar_analysis.length) return

  const analysis = concl.pillar_analysis[pillarIndex]
  if (!analysis) return

  for (const id of indicatorIds) {
    const name = analysis.indicator_lookup[id]
    if (!name) continue

    const key = findIndicatorInIntermediate(analysis.pillar, name)
    if (key) {
      indicatorToExpand.value = key
      return
    }
  }
}

function handleTreeIndicatorHover(key: IndicatorKey) {
  hoverOnTree(key)
}

function handleTreeIndicatorUnhover() {
  hoverOffTree()
}

function openGraphWorkspace(tab: GraphTab = 'operator') {
  activeGraphTab.value = tab
  showGraphWorkspace.value = true
}

function closeGraphWorkspace() {
  showGraphWorkspace.value = false
}

function switchGraphTab(tab: GraphTab) {
  activeGraphTab.value = tab
}

async function handleSubmitOperators(selectedOperatorKeys: string[]) {
  if (!qaSessionId.value || submittingOperator.value) return
  submittingOperator.value = true
  try {
    if (isStaticSession()) {
      operatorViewData.value = filterOperatorViewByKeys(operatorViewData.value, selectedOperatorKeys)
      workflowPhase.value = 'path_select'
      showGraphWorkspace.value = false
      activeGraphTab.value = 'operator'
      return
    }

    const res = await postJson<any>('/api/qa/operators/submit', {
      qa_session_id: qaSessionId.value,
      selected_operator_keys: selectedOperatorKeys,
    })
    operatorViewData.value = res.pillar_operator_view ?? operatorViewData.value
    conclusionData.value = res.conclusion ?? conclusionData.value
    intermediateData.value = res.intermediate ?? intermediateData.value
    workflowPhase.value = (res.workflow_phase || 'path_select') as WorkflowPhase
    showGraphWorkspace.value = false
    activeGraphTab.value = 'operator'
  } finally {
    submittingOperator.value = false
  }
}

async function handleSubmitPath(selectedPathId: string) {
  if (!qaSessionId.value || !selectedPathId || submittingPath.value) return
  submittingPath.value = true
  try {
    if (isStaticSession()) {
      const concl: any = conclusionData.value || {}
      const stage3 = concl.stage3_global_synthesis || {}
      const paths = (stage3.candidate_paths || []) as any[]
      const chosen = paths.find((p) => p?.path_id === selectedPathId) || null
      conclusionData.value = {
        ...concl,
        stage3_global_synthesis: {
          ...stage3,
          selected_path_id: selectedPathId,
          selected_path: chosen,
        },
      } as FinalConclusion
      workflowPhase.value = 'final'
      showGraphWorkspace.value = false
      activeGraphTab.value = 'operator'
      return
    }

    const res = await postJson<any>('/api/qa/path/submit', {
      qa_session_id: qaSessionId.value,
      selected_path_id: selectedPathId,
    })
    operatorViewData.value = res.pillar_operator_view ?? operatorViewData.value
    conclusionData.value = res.conclusion ?? conclusionData.value
    intermediateData.value = res.intermediate ?? intermediateData.value
    workflowPhase.value = (res.workflow_phase || 'final') as WorkflowPhase
    showGraphWorkspace.value = false
    activeGraphTab.value = 'operator'
  } finally {
    submittingPath.value = false
  }
}

function handleOpenSelectedOpsPopup(items: OperatorSelectableItem[]) {
  selectedOpsPreview.value = items
  showSelectedOpsPopup.value = true
}
</script>

<template>
  <div class="result-view">
    <aside class="tree-aside">
      <TreePanel
        :data="intermediateData"
        :operator-view="operatorViewData || null"
        :indicator-to-expand="indicatorToExpand"
        :is-indicator-hovered="isTreeIndicatorHovered"
        @indicator-hover="handleTreeIndicatorHover"
        @indicator-unhover="handleTreeIndicatorUnhover"
        @open-graph-workspace="openGraphWorkspace('operator')"
      />

      <div v-if="showSelectedOpsPopup" class="selected-ops-popup">
        <div class="popup-head">
          <strong>已选算子</strong>
          <button type="button" class="close-btn" @click="showSelectedOpsPopup = false">关闭</button>
        </div>
        <div class="popup-body">
          <p v-if="!selectedOpsPreview.length" class="empty">暂无已选算子</p>
          <ul v-else>
            <li v-for="item in selectedOpsPreview" :key="item.key">
              <b>{{ item.type }}</b>
              <span>{{ item.pillar }}</span>
              <div>{{ item.label }}</div>
            </li>
          </ul>
        </div>
      </div>
    </aside>

    <main class="conclusion-main">
      <ConclusionPanel
        :data="conclusionData"
        :intermediate="intermediateData"
        :operator-view="operatorViewData || null"
        :graph-workspace-visible="showGraphWorkspace"
        :active-graph-tab="activeGraphTab"
        :workflow-phase="workflowPhase"
        :submitting-operator="submittingOperator"
        :submitting-path="submittingPath"
        :is-annotation-highlighted="isAnnotationHighlighted"
        @annotation-hover="handleAnnotationHover"
        @annotation-unhover="handleAnnotationUnhover"
        @annotation-click="handleAnnotationClick"
        @open-graph-workspace="openGraphWorkspace"
        @close-graph-workspace="closeGraphWorkspace"
        @switch-graph-tab="switchGraphTab"
        @submit-operators="handleSubmitOperators"
        @submit-path="handleSubmitPath"
        @open-selected-operators-popup="handleOpenSelectedOpsPopup"
      />
    </main>
  </div>
</template>

<style scoped>
.result-view {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  height: calc(100vh - 72px);
  background: var(--color-bg);
}

.tree-aside {
  position: relative;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-panel);
  min-width: 0;
  overflow: hidden;
}

.conclusion-main {
  min-width: 0;
  overflow: hidden;
}

.selected-ops-popup {
  position: absolute;
  inset: 12px;
  z-index: 20;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
}

.popup-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
}

.popup-body {
  overflow: auto;
  padding: 0.6rem 0.75rem;
  font-size: 0.82rem;
}

.popup-body ul {
  margin: 0;
  padding-left: 1rem;
}

.popup-body li {
  margin-bottom: 0.5rem;
}

.close-btn {
  border: 1px solid var(--color-border);
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  padding: 0.2rem 0.55rem;
}

.empty {
  color: var(--color-text-muted);
}
</style>
