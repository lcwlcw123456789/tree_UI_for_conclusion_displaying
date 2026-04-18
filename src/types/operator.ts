export interface CandidateCause {
  cause_clause: string
  source_hint?: string
}

export interface CausalAnchoringItem {
  indicator_ref: string
  indicator_type: 'table' | 'narrative' | string
  trend_or_claim_sentence?: string
  candidate_causes?: CandidateCause[]
}

export interface EntityAlignmentItem {
  indicator_ref: string
  query_domain?: string
  alignment_relation?: 'direct' | 'indirect' | 'contextual' | string
  confidence?: number
  rationale?: string
}

export interface ConflictItem {
  conflict_type?: string
  involved_indicator_refs?: string[]
  description?: string
  resolution?: string
}

export interface NarrativeRelationItem {
  indicator_ref: string
  relation_type?: 'cause' | 'contrast' | 'condition' | 'background' | 'support' | string
  connective?: string
  proposition?: string
  composed_sentence?: string
}

export interface OperatorBundle {
  causal_anchoring?: CausalAnchoringItem[]
  entity_alignment?: EntityAlignmentItem[]
  conflict_audit?: {
    has_conflict?: boolean
    conflicts?: ConflictItem[]
    overall_resolution?: string
  }
  narrative_relations?: NarrativeRelationItem[]
}

export interface OperatorPillarResult {
  pillar: string
  operators?: OperatorBundle
  indicator_id_map?: {
    ref_to_id?: Record<string, string>
    id_to_name?: Record<string, string>
  }
  paragraph_plan?: {
    evidence_chain?: Array<{
      indicator_ref?: string
      indicator_id?: string
      sentence?: string
      score?: number
    }>
    tension_and_resolution?: string
    closing_insight?: string
  }
}

export interface OperatorView {
  original_question?: string
  operator_results: OperatorPillarResult[]
}
