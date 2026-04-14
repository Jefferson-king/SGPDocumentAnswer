<template>
  <table class="document-table">
    <thead>
      <tr>
        <th>文件名</th>
        <th>状态</th>
        <th>文档类型</th>
        <th>部门</th>
        <th>索引规模</th>
        <th>创建时间</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="doc in documents" :key="doc.id">
        <td>
          <div class="file-name">{{ doc.fileName }}</div>
          <div v-if="doc.summary" class="file-summary">{{ doc.summary }}</div>
        </td>
        <td>{{ formatStatus(doc.status) }}</td>
        <td>{{ doc.docType || '-' }}</td>
        <td>{{ doc.department || '-' }}</td>
        <td>{{ formatIndexStats(doc.ingestionStats) }}</td>
        <td>{{ formatTime(doc.createdAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
defineProps({
  documents: {
    type: Array,
    default: () => []
  }
})

function formatStatus(status) {
  const statusMap = {
    processing: '处理中',
    ready: '已完成',
    failed: '失败'
  }

  return statusMap[status] || status
}

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatIndexStats(stats) {
  if (!stats) return '-'
  return `页 ${stats.pages || 0} / chunk ${stats.chunks || 0}`
}
</script>

<style scoped>
.document-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.document-table th,
.document-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: top;
}

.document-table thead {
  background: #f8fafc;
}

.document-table tbody tr:last-child td {
  border-bottom: none;
}

.file-name {
  font-weight: 600;
}

.file-summary {
  margin-top: 6px;
  color: #64748b;
  font-size: 0.85rem;
  line-height: 1.6;
}
</style>
