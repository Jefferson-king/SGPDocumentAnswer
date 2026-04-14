<template>
  <div class="documents-page">
    <section class="page-header">
      <h1>文档列表</h1>
      <p>查看已上传文档、结构化解析状态，以及多层索引规模。</p>
    </section>

    <div v-if="loading">加载中...</div>
    <div v-else-if="errorMessage">{{ errorMessage }}</div>
    <div v-else-if="documents.length === 0">当前还没有文档。</div>
    <DocumentTable v-else :documents="documents" />

    <button @click="loadDocuments">刷新列表</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import DocumentTable from '../components/DocumentTable.vue'
import { fetchDocuments } from '../api/documents'

const documents = ref([])
const loading = ref(false)
const errorMessage = ref('')

async function loadDocuments() {
  try {
    loading.value = true
    errorMessage.value = ''
    documents.value = await fetchDocuments()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDocuments()
})
</script>
