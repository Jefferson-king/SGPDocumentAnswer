# Day 23 开发文档

## 目标

今天完成上传页 UI 的正式开发文档，包含：
- 访问文件入口（拖拽/点击）
- 文件校验（只支持 PDF/TXT、大小限制）
- 状态展示（idle、validating、uploading、processing、success、error）
- Mock 状态打通完整交互
- 可切换为真实后端接口的代码结构

## 目录结构

建议当天至少准备以下文件：

- `frontend/src/pages/UploadPage.vue`
- `frontend/src/components/UploadDropzone.vue`
- `frontend/src/components/UploadStatusPanel.vue`（可选）

如果你已经有了 `UploadPage.vue` 和 `UploadDropzone.vue`，下面的文档可以直接参考并迁移。

---

## 一、页面设计思路

### 1. 上传页最小组成

- 上传说明区：告诉用户可上传文件类型和限制
- 拖拽 / 选择文件区：核心入口
- 当前文件状态区：显示选中文件信息和校验结果
- 处理结果区：显示上传中、处理中、成功或失败状态

### 2. 状态机

前端状态建议如下：

- `idle`：未选择文件
- `validating`：正在校验文件
- `ready`：校验通过，准备上传
- `uploading`：正在上传文件
- `processing`：后端正在入库处理
- `success`：已成功进入知识库
- `error`：上传或校验失败

---

## 二、核心文件：`UploadPage.vue`

以下是一个完整的可用版本，包含拖拽、选择、校验、mock 上传和状态展示。

```vue
<template>
  <div class="upload-page">
    <section class="upload-header">
      <h1>上传知识文档</h1>
      <p>支持 PDF / TXT，最大 20MB。上传后系统会自动将文档转为知识库。</p>
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

<script>
import UploadDropzone from '@/components/UploadDropzone.vue'

export default {
  components: { UploadDropzone },
  data() {
    return {
      acceptedTypes: ['application/pdf', 'text/plain'],
      status: 'idle',
      selectedFile: null,
      errorMessage: '',
      dragActive: false,
    }
  },
  methods: {
    handleDragEnter() {
      this.dragActive = true
    },
    handleDragLeave() {
      this.dragActive = false
    },
    handleFileSelected(file) {
      this.selectedFile = file
      this.status = 'validating'
      this.errorMessage = ''
      this.dragActive = false

      this.$nextTick(() => {
        this.validateFile(file)
      })
    },
    validateFile(file) {
      const maxSize = 20 * 1024 * 1024
      const allowedTypes = ['application/pdf', 'text/plain']

      if (!allowedTypes.includes(file.type)) {
        this.status = 'invalid'
        this.errorMessage = '只支持 PDF 或 TXT 文件。'
        return
      }

      if (file.size > maxSize) {
        this.status = 'invalid'
        this.errorMessage = '文件大小不能超过 20MB。'
        return
      }

      this.status = 'ready'
    },
    startUpload() {
      if (!this.selectedFile) {
        this.status = 'invalid'
        this.errorMessage = '请先选择要上传的文档。'
        return
      }

      this.status = 'uploading'
      this.errorMessage = ''

      setTimeout(() => {
        this.status = 'processing'

        setTimeout(() => {
          this.status = 'success'
        }, 1200)
      }, 1000)
    },
    retry() {
      if (this.selectedFile) {
        this.status = 'ready'
        this.errorMessage = ''
      } else {
        this.reset()
      }
    },
    reset() {
      this.status = 'idle'
      this.selectedFile = null
      this.errorMessage = ''
      this.dragActive = false
    },
    readableFileSize(size) {
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
      return `${(size / 1024 / 1024).toFixed(1)} MB`
    },
  },
}
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

### 代码说明

- `UploadDropzone` 负责拖拽和选择入口，并把选中的 `File` 对象传给父组件
- `handleFileSelected(file)` 进入校验流程
- `validateFile(file)` 做类型和大小校验
- `startUpload()` 用 mock 定时器模拟上传和处理阶段
- `status` 用于控制页面显示不同状态区
- `readableFileSize()` 提供友好文件大小显示

---

## 三、拖拽组件：`UploadDropzone.vue`

这个组件负责：
- 支持拖拽文件
- 支持点击选择文件
- 触发 `file-selected` 事件

```vue
<template>
  <div
    class="dropzone"
    :class="{ active: dragActive }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    @click="triggerFileInput"
  >
    <input
      ref="fileInput"
      type="file"
      accept=".pdf,.txt"
      @change="onFileChange"
      class="visually-hidden"
    />

    <div class="dropzone-content">
      <h2>把文件拖拽到这里，或点击选择文件</h2>
      <p>仅支持 PDF / TXT，单次上传一个文件</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    dragActive: {
      type: Boolean,
      default: false,
    },
    acceptedTypes: {
      type: Array,
      default: () => ['application/pdf', 'text/plain'],
    },
  },
  methods: {
    triggerFileInput() {
      this.$refs.fileInput.click()
    },
    onFileChange(event) {
      const file = event.target.files[0]
      if (file) {
        this.$emit('file-selected', file)
      }
      event.target.value = null
    },
    onDragEnter() {
      this.$emit('drag-enter')
    },
    onDragOver() {
      this.$emit('drag-enter')
    },
    onDragLeave() {
      this.$emit('drag-leave')
    },
    onDrop(event) {
      const file = event.dataTransfer.files[0]
      if (file) {
        this.$emit('file-selected', file)
      }
      this.$emit('drag-leave')
    },
  },
}
</script>

<style scoped>
.dropzone {
  border: 2px dashed #94a3b8;
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.dropzone.active {
  border-color: #2563eb;
  background-color: #eff6ff;
}

.dropzone-content h2 {
  margin-bottom: 8px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  border: 0;
  padding: 0;
  clip: rect(0, 0, 0, 0);
  overflow: hidden;
  white-space: nowrap;
}
</style>
```

### 说明

- `triggerFileInput()` 支持点击上传
- 拖拽过程仅统一走 `file-selected` 逻辑，避免重复代码
- `acceptedTypes` 作为 props 可以在后续改成动态检查

---

## 四、扩展建议

### 1. 直接接真实后端

当后端接口可用后，替换 `startUpload()` 内的 `setTimeout` 模拟逻辑：

```js
startUpload() {
  if (!this.selectedFile) return
  this.status = 'uploading'

  const formData = new FormData()
  formData.append('file', this.selectedFile)

  fetch('/api/documents/upload', {
    method: 'POST',
    body: formData,
  })
    .then((res) => res.json())
    .then((result) => {
      if (result.ok) {
        this.status = 'processing'
        this.pollDocumentStatus(result.data.documentId)
      } else {
        this.status = 'error'
        this.errorMessage = result.message || '上传失败，请重试。'
      }
    })
    .catch(() => {
      this.status = 'error'
      this.errorMessage = '网络错误，请检查连接后重试。'
    })
}
```

然后实现 `pollDocumentStatus(documentId)`，用于轮询 `GET /api/documents/:id/status`。

### 2. 后端状态反馈

- `uploading`：前端已成功发起文件上传请求
- `processing`：后端已接收文件并开始入库
- `success`：后端完成入库，文档可用于问答
- `error`：上传或处理失败

### 3. UI 细节增强

- 成功后显示“查看文档列表”按钮
- 失败时提示具体错误原因
- 上传中禁用上传按钮，防止重复点击
- 支持多个文件类型提示，例如 PDF/TXT、文件大小上限

---

## 五、关键说明与实践要点

### 1. 不要把拖拽和点击逻辑拆成两套

`UploadDropzone.vue` 只负责获取文件，并统一发出 `file-selected`。
`UploadPage.vue` 负责校验和状态流转。

### 2. 校验要在前端先做一遍

前端校验能避免大量无意义请求，还能给用户更快的反馈。后端仍需要做最终校验。

### 3. 处理状态和上传状态要分开

`上传完成` !== `入库完成`。
页面要让用户看到：
- 已上传到服务器
- 后端是否已经完成知识库入库

### 4. 真正接口联调时，只需要改 `startUpload()` 和 `pollDocumentStatus()`

保持当前 UI 结构，明天只替换网络请求逻辑就可以。

---

## 六、文件内容总结

- `frontend/src/pages/UploadPage.vue`
  - 负责整体页面布局、状态管理、文件校验、上传流程

- `frontend/src/components/UploadDropzone.vue`
  - 负责用户交互入口：拖拽和点击选择文件

把这两个文件按文档中的代码写好，就能得到一个正式的上传页 UI，满足 Day 23 需求。
