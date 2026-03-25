/**
 * 加载中间结果和最终结论数据
 */
import { ref, computed } from 'vue'
import type { IntermediateResult } from '../types/intermediate'
import type { FinalConclusion } from '../types/conclusion'

const INTERMEDIATE_URL = '/data_4/final_qed_with_retrieval.json'
const CONCLUSION_URL = '/data_4/final_conclusion_labeled.json'

export function useDataLoader() {
  const intermediateData = ref<IntermediateResult | null>(null)
  const conclusionData = ref<FinalConclusion | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function loadData() {
    loading.value = true
    error.value = null

    try {
      const [intermediateRes, conclusionRes] = await Promise.all([
        fetch(INTERMEDIATE_URL),
        fetch(CONCLUSION_URL),
      ])

      if (!intermediateRes.ok || !conclusionRes.ok) {
        throw new Error('Failed to load data files')
      }

      intermediateData.value = await intermediateRes.json()
      conclusionData.value = await conclusionRes.json()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  const isReady = computed(() => 
    !loading.value && intermediateData.value && conclusionData.value
  )

  return {
    intermediateData,
    conclusionData,
    loading,
    error,
    loadData,
    isReady,
  }
}
