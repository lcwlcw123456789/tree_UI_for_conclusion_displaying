/**
 * 中间结果文件 (final_qed_with_retrieval) 的数据类型定义
 */

export interface RetrievedEvidence {
  id: string
  page: number
  text: string
  score: number
  type: string
  evidence_source: 'retrieved' | 'linked'
}

export interface NarrativeTask {
  indicator_name: string
  factoid_question: string
  source_text_id: string
  source_page: number
  is_quantitative: boolean
  rationale_from_extraction: string
  retrieved_evidence: RetrievedEvidence[]
}

export interface SubIndicator {
  sub_indicator_name: string
  factoid_question: string
  relevance_rationale: string
  source_text_id: string
  values: Record<string, string>
  linked_text_evidence_id?: string
  retrieved_evidence: RetrievedEvidence[]
}

export interface TableStructuredTask {
  indicator_name: string
  source_page: number
  sub_indicators: SubIndicator[]
}

export interface PillarResult {
  pillar: string
  narrative_tasks: NarrativeTask[]
  table_structured_tasks: TableStructuredTask[]
}

export interface IntermediateResult {
  query: string
  category: string
  results: PillarResult[]
}

/**
 * 树形结构节点 - 用于前端展示
 */
export type TreeNodeType = 'query' | 'pillar' | 'narrative_indicator' | 'table_indicator' | 'evidence'

export interface TreeEvidenceNode {
  type: 'evidence'
  evidence: RetrievedEvidence
  parentIndicatorName: string
}

export interface TreeNarrativeIndicatorNode {
  type: 'narrative_indicator'
  task: NarrativeTask
  pillarIndex: number
  indicatorIndex: number
}

export interface TreeTableIndicatorNode {
  type: 'table_indicator'
  task: TableStructuredTask
  pillarIndex: number
  indicatorIndex: number
}

export interface TreePillarNode {
  type: 'pillar'
  pillar: string
  pillarIndex: number
}

export interface TreeQueryNode {
  type: 'query'
  query: string
}
