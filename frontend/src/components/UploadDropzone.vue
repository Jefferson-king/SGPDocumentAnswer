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

<script setup>
import { ref } from 'vue'

defineProps({
  dragActive: {
    type: Boolean,
    default: false,
  },
  acceptedTypes: {
    type: Array,
    default: () => ['application/pdf', 'text/plain'],
  },
})

const emit = defineEmits(['file-selected', 'drag-enter', 'drag-leave'])
const fileInput = ref(null)

const triggerFileInput = () => {
  fileInput.value.click()
}

const onFileChange = (event) => {
  const file = event.target.files[0]
  if (file) {
    emit('file-selected', file)
  }
  event.target.value = null
}

const onDragEnter = () => {
  emit('drag-enter')
}

const onDragOver = () => {
  emit('drag-enter')
}

const onDragLeave = () => {
  emit('drag-leave')
}

const onDrop = (event) => {
  const file = event.dataTransfer.files[0]
  if (file) {
    emit('file-selected', file)
  }
  emit('drag-leave')
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