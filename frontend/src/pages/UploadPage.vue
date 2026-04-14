<template>
  <div class="upload-page">
    <section class="upload-header">
      <h1>上传知识文档</h1>
      <p>支持 PDF / TXT,最大 20MB。上传后系统会自动将文档转为知识库。</p>
    </section>

    <UploadDropzone
      :dragActive="dragActive"
      :acceptedTypes="acceptedTypes"
      @file-selected="handleFileSelected"
      @drag-enter="handleDragEnter"
      @drag-leave="handleDragLeave"
    />

    <section class="status-panel">
      <div v-if="status === 'idle'">
        <p>请选择文件开始上传。</p>
      </div>

      <div v-if="status === 'invalid'" class="status-error">
        <p>{{ errorMessage }}</p>
      </div>

      <div v-if="selectedFile" class="file-info">
        <p>文件名：{{ selectedFile.name }}</p>
        <p>类型：{{ selectedFile.type || '未知' }}</p>
        <p>大小：{{ readableFileSize(selectedFile.size) }}</p>
      </div>

      <div v-if="status === 'uploading'" class="status-info">
        <p>上传中...</p>
      </div>

      <div v-if="status === 'processing'" class="status-info">
        <p>文档处理进行中，稍等片刻...</p>
      </div>

      <div v-if="status === 'success'" class="status-success">
        <p>上传成功！文档已进入知识库。</p>
        <button @click="reset">上传另一个文档</button>
      </div>

      <div v-if="status === 'error'" class="status-error">
        <p>{{ errorMessage }}</p>
        <button @click="retry">重试</button>
      </div>

      <button
        v-if="status === 'ready'"
        class="primary-button"
        @click="startUpload"
      >
        开始上传
      </button>

      <button
        v-if="status === 'invalid' && selectedFile"
        class="secondary-button"
        @click="reset"
      >
        重新选择
      </button>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import UploadDropzone from '../components/UploadDropzone.vue'
import { uploadDocument, fetchDocumentStatus } from '../api/documents'

const acceptedTypes = ['application/pdf', 'text/plain']
const status = ref('idle')
const selectedFile = ref(null)
const errorMessage = ref('')
const dragActive = ref(false)
const currentDocument = ref(null)

let pollTimer = null

const handleDragEnter = () => {
  dragActive.value = true
}

const handleDragLeave = () => {
  dragActive.value = false
}

const handleFileSelected = (file) => {
  selectedFile.value = file
  errorMessage.value = ''
  dragActive.value = false
  validateFile(file)
}

const validateFile = (file) => {
  const maxSize = 20 * 1024 * 1024
  const allowedExts = ['.pdf', '.txt']
  const fileName = file.name.toLowerCase()

  const validExt = allowedExts.some(ext => fileName.endsWith(ext))
  if (!validExt) {
    status.value = 'invalid'
    errorMessage.value = '只支持 PDF 或 TXT 文件'
    return
  }

  if (file.size > maxSize) {
    status.value = 'invalid'
    errorMessage.value = '文件大小不能超过 20MB'
    return
  }

  status.value = 'ready'
}

const startUpload = async () => {
  if (!selectedFile.value) {
    status.value = 'invalid'
    errorMessage.value = '请先选择文件'
    return
  }

  try {
    status.value = 'uploading'
    errorMessage.value = ''

    const result = await uploadDocument(selectedFile.value)

    currentDocument.value = {
      id: result.documentId,
      fileName: result.fileName,
      status: result.status
    }

    status.value = 'processing'
    startPolling(result.documentId)
  } catch (error) {
    status.value = 'error'
    errorMessage.value = error.message
  }
}

const startPolling = (documentId) => {
  stopPolling()

  pollTimer = setInterval(async () => {
    try {
      const document = await fetchDocumentStatus(documentId)
      currentDocument.value = document

      if (document.status === 'ready') {
        status.value = 'success'
        stopPolling()
      }

      if (document.status === 'failed') {
        status.value = 'error'
        errorMessage.value = document.error || '文档处理失败'
        stopPolling()
      }
    } catch (error) {
      status.value = 'error'
      errorMessage.value = error.message
      stopPolling()
    }
  }, 1500)
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const retry = () => {
  errorMessage.value = ''
  if (selectedFile.value) {
    status.value = 'ready'
  } else {
    reset()
  }
}

const reset = () => {
  stopPolling()
  status.value = 'idle'
  selectedFile.value = null
  errorMessage.value = ''
  dragActive.value = false
  currentDocument.value = null
}

const readableFileSize = (size) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

onBeforeUnmount(() => {
  stopPolling()
})
</script>


<style scoped>
.upload-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
}

.upload-header {
  margin-bottom: 20px;
}

.status-panel {
  margin-top: 24px;
  padding: 18px;
  border: 1px solid #e3e7ee;
  border-radius: 12px;
  background: #fafbff;
}

.status-info {
  color: #1f2937;
}

.status-success {
  color: #166534;
}

.status-error {
  color: #b91c1c;
}

.primary-button,
.secondary-button {
  margin-top: 14px;
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.primary-button {
  background: #2563eb;
  color: white;
}

.secondary-button {
  background: #f3f4f6;
  color: #111827;
}

.file-info p {
  margin: 4px 0;
}
</style>
```