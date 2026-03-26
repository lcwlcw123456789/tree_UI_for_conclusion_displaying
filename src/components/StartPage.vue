<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useBackend } from '../composables/useBackend'

interface CompanyItem {
  id: string
  name: string
}

const emit = defineEmits<{
  ready: [payload: { companyId: string; structure: any }]
}>()

const { get, postJson, buildUrl } = useBackend()

const companies = ref<CompanyItem[]>([])
const loadingCompanies = ref(false)
const loadingUpload = ref(false)
const error = ref<string | null>(null)
const selectedCompanyId = ref<string | null>(null)

const uploadInput = ref<HTMLInputElement | null>(null)

async function loadCompanies() {
  loadingCompanies.value = true
  error.value = null
  try {
    const data = await get<{ items: CompanyItem[] }>('/api/companies')
    companies.value = data.items
    console.log('[start-page] loaded companies', data.items)
  } catch (e: any) {
    error.value = e?.message || '加载公司列表失败'
  } finally {
    loadingCompanies.value = false
  }
}

onMounted(() => {
  loadCompanies()
})

async function confirmExisting() {
  if (!selectedCompanyId.value) return
  error.value = null
  try {
    const structure = await get<any>(`/api/document/${selectedCompanyId.value}/structure`)
    console.log('[start-page] structure for', selectedCompanyId.value, structure)
    emit('ready', { companyId: selectedCompanyId.value, structure })
  } catch (e: any) {
    error.value = e?.message || '加载文档结构失败'
  }
}

function triggerUpload() {
  uploadInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || !input.files[0]) return

  const file = input.files[0]
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    error.value = '仅支持上传 PDF 文件'
    input.value = ''
    return
  }

  loadingUpload.value = true
  error.value = null

  try {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(buildUrl('/api/upload'), {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || '上传或预处理失败')
    }

    const data = await res.json()
    emit('ready', { companyId: data.company_id, structure: data.structure })
  } catch (e: any) {
    error.value = e?.message || '上传或预处理失败'
  } finally {
    loadingUpload.value = false
    if (input) input.value = ''
  }
}
</script>

<template>
  <section class="start-page">
    <div class="start-card">
      <h2 class="title">选择分析文档</h2>
      <p class="subtitle">
        可以从已有缓存公司中选择，也可以上传新的财报 PDF 进行端到端处理。
      </p>

      <div class="split-layout">
        <div class="panel">
          <h3>使用已有缓存</h3>
          <p class="panel-desc">当前支持的公司会根据 data/document 目录自动更新。</p>
          <div class="company-list" v-if="!loadingCompanies">
            <button
              v-for="c in companies"
              :key="c.id"
              type="button"
              class="company-pill"
              :class="{ active: c.id === selectedCompanyId }"
              @click="selectedCompanyId = c.id"
            >
              {{ c.name }}
            </button>
            <p v-if="!companies.length" class="hint-text">暂未发现缓存公司，请尝试上传 PDF。</p>
          </div>
          <div v-else class="loading-text">正在加载公司列表...</div>
          <button
            type="button"
            class="primary-button"
            :disabled="!selectedCompanyId || loadingUpload"
            @click="confirmExisting"
          >
            进入文档浏览
          </button>
        </div>

        <div class="divider" />

        <div class="panel">
          <h3>上传新文档</h3>
          <p class="panel-desc">
            上传 PDF 后将自动调用后端 OCR 与文档预处理管线，生成 pillar、indicator 与表格缓存。
          </p>
          <button
            type="button"
            class="secondary-button"
            :disabled="loadingUpload"
            @click="triggerUpload"
          >
            {{ loadingUpload ? '处理中…' : '上传 PDF 文档' }}
          </button>
          <input
            ref="uploadInput"
            type="file"
            accept="application/pdf"
            class="hidden-input"
            @change="handleFileChange"
          />
          <p class="hint-text">
            上传过程中请勿关闭页面，进度可在后续页面查看详细日志。
          </p>
        </div>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.start-page {
  min-height: calc(100vh - 72px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.start-card {
  max-width: 960px;
  width: 100%;
  background: var(--color-bg-panel);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
  padding: 1.75rem 2rem 2rem;
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
}

.subtitle {
  margin: 0 0 1.5rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.split-layout {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1.5rem;
  align-items: stretch;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-desc {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.company-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0 0.75rem;
}

.company-pill {
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 0.35rem 0.9rem;
  font-size: 0.85rem;
  background: var(--color-bg-muted);
  cursor: pointer;
}

.company-pill.active {
  border-color: var(--color-primary);
  background: var(--color-accent-light);
  color: var(--color-primary);
}

.primary-button,
.secondary-button {
  border-radius: 999px;
  border: none;
  padding: 0.45rem 1.1rem;
  font-size: 0.9rem;
  cursor: pointer;
  align-self: flex-start;
}

.primary-button {
  background: var(--color-primary);
  color: white;
}

.primary-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.secondary-button {
  background: var(--color-bg-muted);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.secondary-button:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.divider {
  width: 1px;
  background: var(--color-border);
}

.hint-text {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.loading-text {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.5rem 0 0.75rem;
}

.error-text {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #dc2626;
}

.hidden-input {
  display: none;
}
</style>
