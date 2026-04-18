/**
 * 最终结论文件 (final_conclusion_labeled) 的数据类型定义
 */

export interface ReferencedIndicator {
  indicator_id: string
  indicator_name: string
}

export interface PillarAnalysis {
  pillar: string
  paragraph: string
  referenced_indicators: ReferencedIndicator[]
  indicator_lookup: Record<string, string>
}

export interface FinalConclusion {
  original_question: string
  final_answer: string
  pillar_analysis: PillarAnalysis[]
  stage3_global_synthesis?: Stage3GlobalSynthesis
}

export interface Stage3TreeNode {
  node_id: string
  node_type: 'root' | 'pillar' | 'indicator_candidate' | string
  label?: string
  pillar?: string
  indicator_id?: string
  indicator_name?: string
  indicator_ref?: string
  selection_score?: number
  selected?: boolean
  raw_source?: any
  operator_source?: any
}

export interface Stage3TreeEdge {
  edge_id: string
  from: string
  to: string
  relation_type: 'hierarchy' | 'intra_pillar_sequence' | 'conflict' | 'cross_pillar_support' | string
  weight?: number
  evidence?: any
}

export interface Stage3TreeGraph {
  root_id: string
  nodes: Stage3TreeNode[]
  edges: Stage3TreeEdge[]
  selection?: {
    top_k_per_pillar?: number
    candidate_node_ids?: string[]
    selected_node_ids?: string[]
    excluded_node_ids?: string[]
    candidate_count?: number
    selected_count?: number
  }
}

export interface Stage3Path {
  path_id?: string
  title?: string
  core_thesis?: string
  node_path?: string[]
  cross_pillar_links?: string[]
  tensions_or_gaps?: string[]
  resolution_logic?: string[]
  coverage_score?: number
  coherence_score?: number
  faithfulness_score?: number
  why_it_wins?: string | null
}

export interface Stage3GlobalSynthesis {
  tree_graph?: Stage3TreeGraph
  candidate_paths?: Stage3Path[]
  selected_path_id?: string
  selected_path?: Stage3Path
}

/**
 * 解析后的段落片段 - 用于渲染带标注的段落
 * cited: 被标注引用的文本（高亮和 hover 作用在文本本身）
 * plain: 无标注的普通文本
 */
export type ParagraphSegment =
  | { type: 'cited'; content: string; indicatorIds: string[] }
  | { type: 'plain'; content: string }
