/**
 * 树形展示与结论展示之间的联动状态
 * 双向 hover：悬停文本或树节点时，另一侧对应位置高亮
 * 高亮按 pillar 作用域：仅高亮当前 pillar 下的对应文本
 */
import { ref } from 'vue'
import type { IntermediateResult } from '../types/intermediate'
import type { FinalConclusion } from '../types/conclusion'

export interface IndicatorKey {
  pillarIndex: number
  pillarName: string
  indicatorName: string
  indicatorType: 'narrative' | 'table'
  indicatorIndex: number
}

export function useIndicatorLink(
  intermediateData: { value: IntermediateResult | null },
  conclusionData: { value: FinalConclusion | null }
) {
  const hoveredIndicator = ref<IndicatorKey | null>(null)

  /** 高亮状态：按 pillar 作用域，只高亮对应 pillar 下的文本 */
  const highlightedAnnotations = ref<{
    pillarIndex: number
    indicatorIds: Set<string>
  } | null>(null)

  function findIndicatorInIntermediate(
    pillarName: string,
    indicatorName: string
  ): IndicatorKey | null {
    const data = intermediateData.value
    if (!data) return null

    for (let pi = 0; pi < data.results.length; pi++) {
      const pillar = data.results[pi]
      if (!pillar || pillar.pillar !== pillarName) continue

      const ni = pillar.narrative_tasks.findIndex(
        (t) => t.indicator_name === indicatorName
      )
      if (ni >= 0) {
        return {
          pillarIndex: pi,
          pillarName: pillar.pillar,
          indicatorName,
          indicatorType: 'narrative',
          indicatorIndex: ni,
        }
      }

      const ti = pillar.table_structured_tasks.findIndex(
        (t) => t.indicator_name === indicatorName
      )
      if (ti >= 0) {
        return {
          pillarIndex: pi,
          pillarName: pillar.pillar,
          indicatorName,
          indicatorType: 'table',
          indicatorIndex: ti,
        }
      }
    }
    return null
  }

  function hoverOnConclusion(pillarIndex: number, indicatorIds: string[]): void {
    const concl = conclusionData.value
    if (!concl || pillarIndex >= concl.pillar_analysis.length) return

    const analysis = concl.pillar_analysis[pillarIndex]
    if (!analysis) return

    const names = new Set<string>()
    for (const id of indicatorIds) {
      const name = analysis.indicator_lookup[id]
      if (name) names.add(name)
    }

    for (const name of names) {
      const key = findIndicatorInIntermediate(analysis.pillar, name)
      if (key) {
        hoveredIndicator.value = key
        highlightedAnnotations.value = {
          pillarIndex,
          indicatorIds: new Set(indicatorIds),
        }
        return
      }
    }

    highlightedAnnotations.value = {
      pillarIndex,
      indicatorIds: new Set(indicatorIds),
    }
  }

  function hoverOffConclusion(): void {
    hoveredIndicator.value = null
    highlightedAnnotations.value = null
  }

  function hoverOnTree(key: IndicatorKey): void {
    hoveredIndicator.value = key

    const concl = conclusionData.value
    if (!concl) {
      highlightedAnnotations.value = null
      return
    }

    const conclPillarIndex = concl.pillar_analysis.findIndex(
      (pa) => pa.pillar === key.pillarName
    )
    if (conclPillarIndex < 0) {
      highlightedAnnotations.value = null
      return
    }

    const analysis = concl.pillar_analysis[conclPillarIndex]
    if (!analysis) {
      highlightedAnnotations.value = null
      return
    }

    const ids: string[] = []
    for (const [id, name] of Object.entries(analysis.indicator_lookup)) {
      if (name === key.indicatorName) ids.push(id)
    }

    highlightedAnnotations.value = {
      pillarIndex: conclPillarIndex,
      indicatorIds: new Set(ids),
    }
  }

  function hoverOffTree(): void {
    hoveredIndicator.value = null
    highlightedAnnotations.value = null
  }

  /** 仅当 pillarIndex 和 indicatorId 都匹配时才高亮 */
  function isAnnotationHighlighted(
    pillarIndex: number,
    indicatorId: string
  ): boolean {
    const h = highlightedAnnotations.value
    if (!h || h.pillarIndex !== pillarIndex) return false
    return h.indicatorIds.has(indicatorId)
  }

  function isTreeIndicatorHovered(key: IndicatorKey): boolean {
    const h = hoveredIndicator.value
    if (!h) return false
    return (
      h.pillarIndex === key.pillarIndex &&
      h.indicatorName === key.indicatorName &&
      h.indicatorType === key.indicatorType &&
      h.indicatorIndex === key.indicatorIndex
    )
  }

  return {
    hoveredIndicator,
    highlightedAnnotations,
    findIndicatorInIntermediate,
    hoverOnConclusion,
    hoverOffConclusion,
    hoverOnTree,
    hoverOffTree,
    isAnnotationHighlighted,
    isTreeIndicatorHovered,
  }
}
