<template>
  <section class="citation-list">
    <div class="citation-title">引用依据</div>

    <div v-if="!citations.length" class="citation-empty">
      本次回答没有可展示的引用
    </div>

    <div v-else class="citation-items">
      <article
        v-for="citation in citations"
        :key="citation.chunkId || citation.id"
        class="citation-card"
      >
        <div class="citation-meta">
          <span class="citation-source">{{ citation.source || '未知文档' }}</span>
          <span class="citation-page">{{ formatPage(citation.page) }}</span>
        </div>

        <div class="citation-tags">
          <span class="citation-chip">{{ citation.unitType || 'chunk' }}</span>
          <span v-if="citation.section" class="citation-chip">{{ citation.section }}</span>
          <span v-if="citation.chunkId" class="citation-chip">{{ citation.chunkId }}</span>
        </div>

        <p class="citation-snippet">
          {{ citation.snippet || '暂无片段预览' }}
        </p>
      </article>
    </div>
  </section>
</template>

<script setup>
defineProps({
  citations: {
    type: Array,
    default: () => []
  }
})

function formatPage(page) {
  const pageNumber = Number(page)
  return Number.isFinite(pageNumber) ? `第 ${pageNumber} 页` : '页码未知'
}
</script>

<style scoped>
.citation-list {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(103, 232, 249, 0.14);
}

.citation-title {
  margin-bottom: 10px;
  color: #9ae6ff;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.citation-items {
  display: grid;
  gap: 10px;
}

.citation-card,
.citation-empty {
  padding: 12px 14px;
  border: 1px solid rgba(103, 232, 249, 0.14);
  border-radius: 14px;
  background: rgba(10, 24, 46, 0.56);
}

.citation-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.84rem;
}

.citation-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.citation-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(103, 232, 249, 0.08);
  border: 1px solid rgba(103, 232, 249, 0.18);
  color: rgba(214, 240, 255, 0.8);
  font-size: 0.76rem;
}

.citation-source {
  color: #d8f6ff;
  font-weight: 600;
  word-break: break-word;
}

.citation-page {
  color: rgba(214, 240, 255, 0.7);
  font-size: 0.8rem;
}

.citation-snippet,
.citation-empty {
  margin: 0;
  color: rgba(230, 247, 255, 0.86);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
