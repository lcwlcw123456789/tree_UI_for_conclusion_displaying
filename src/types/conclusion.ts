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
}

/**
 * 解析后的段落片段 - 用于渲染带标注的段落
 * cited: 被标注引用的文本（高亮和 hover 作用在文本本身）
 * plain: 无标注的普通文本
 */
export type ParagraphSegment =
  | { type: 'cited'; content: string; indicatorIds: string[] }
  | { type: 'plain'; content: string }
