<template>
  <div class="ask-page">
    <header class="page-header">
      <h1>企业知识库问答</h1>
      <p>
        系统会先做 Query Understanding，再执行“多路召回 -> 带约束 rerank -> final context”。
        复杂问题会自动启用 query rewrite、decomposition、HyDE 和全库级摘要检索。
      </p>

      <div class="header-tags">
        <span>{{ documentsLoaded ? `已就绪 ${readyDocuments.length} / ${documents.length} 份文档` : '正在扫描文档' }}</span>
        <span>上下文化检索 + BM25</span>
        <span>父块 / 页级 / 摘要级召回</span>
        <span>结构化输出: answer / citations / summary / confidence</span>
      </div>
    </header>

    <div v-if="pageError" class="page-error">
      {{ pageError }}
    </div>

    <div v-if="documentsLoaded && readyDocuments.length === 0" class="empty-state">
      当前还没有可提问的已完成文档，请先上传并等待处理完成。
    </div>

    <div ref="messageContainer" class="messages-panel">
      <MessageList :messages="messages" />
    </div>

    <form class="composer" @submit.prevent="handleSubmit">
      <div class="document-selector">
        <label for="document-select">当前文档范围</label>
        <select
          id="document-select"
          v-model="selectedDocumentId"
          :disabled="sending || readyDocuments.length === 0"
        >
          <option value="">全库检索 / 不限文档</option>
          <option
            v-for="doc in readyDocuments"
            :key="doc.id"
            :value="doc.id"
          >
            {{ doc.fileName }}
          </option>
        </select>
        <p class="document-hint">
          当前选择：{{ selectedDocumentName || '全库' }}。如果你要问“这套制度核心变化是什么”或“两个部门流程差异在哪”，建议保持全库模式。
        </p>
      </div>

      <textarea
        v-model="question"
        :disabled="sending || readyDocuments.length === 0"
        placeholder="输入问题，例如：A 部门和 B 部门流程差异在哪？这套制度的核心变化是什么？"
        rows="3"
      />

      <div class="composer-footer">
        <button
          type="button"
          class="clear-button"
          :disabled="sending || messages.length <= 1"
          @click="clearConversation"
        >
          新会话
        </button>

        <span v-if="sending">正在生成回答...</span>

        <button class="send-button" :disabled="!canSend">
          {{ sending ? '回答中...' : '发送' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'

import MessageList from '../components/MessageList.vue'
import { askQuestionStream } from '../api/qa'
import { fetchDocuments } from '../api/documents'
import { toRequestHistory } from '../utils/chatHistory'

const question = ref('')
const sending = ref(false)
const pageError = ref('')
const documents = ref([])
const documentsLoaded = ref(false)
const selectedDocumentId = ref('')
const messageContainer = ref(null)

const readyDocuments = computed(() => documents.value.filter(doc => doc.status === 'ready'))
const selectedDocumentName = computed(() => {
  return readyDocuments.value.find(doc => doc.id === selectedDocumentId.value)?.fileName || ''
})

function createWelcomeMessage() {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '可以开始提问了。系统会自动识别问题类型，并在事实问答、总结问答、对比问答和追问问答之间切换对应策略。',
    status: 'done',
    citations: [],
    showCitationState: false,
    includeInHistory: false,
    mode: null,
    questionType: null,
    routeReason: '',
    planSummary: '',
    answerSummary: '',
    confidence: null
  }
}

const messages = ref([createWelcomeMessage()])

const canSend = computed(() => {
  return question.value.trim() && !sending.value && readyDocuments.value.length > 0
})

onMounted(async () => {
  try {
    documents.value = await fetchDocuments()

    if (readyDocuments.value.length === 1) {
      selectedDocumentId.value = readyDocuments.value[0].id
    }
  } catch (error) {
    pageError.value = error.message || '获取文档列表失败'
  } finally {
    documentsLoaded.value = true
    await nextTick()
    scrollToBottom()
  }
})

function createMessage(role, content = '', status = 'done', extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    status,
    citations: [],
    showCitationState: false,
    includeInHistory: true,
    mode: null,
    questionType: null,
    routeReason: '',
    planSummary: '',
    answerSummary: '',
    confidence: null,
    ...extra
  }
}

function findMessage(messageId) {
  return messages.value.find(message => message.id === messageId)
}

function updateMessage(messageId, patch) {
  const target = findMessage(messageId)
  if (!target) return
  Object.assign(target, patch)
}

function appendMessageContent(messageId, content) {
  const target = findMessage(messageId)
  if (!target) return
  target.content += content
}

function clearConversation() {
  if (sending.value) return
  messages.value = [createWelcomeMessage()]
  pageError.value = ''
  question.value = ''
  nextTick(scrollToBottom)
}

async function handleSubmit() {
  const text = question.value.trim()
  if (!text || sending.value) return

  if (readyDocuments.value.length === 0) {
    pageError.value = '请先上传并等待文档处理完成，再开始提问。'
    return
  }

  const requestHistory = toRequestHistory(messages.value)

  pageError.value = ''
  sending.value = true

  const userMessage = createMessage('user', text, 'done')
  const assistantMessage = createMessage('assistant', '', 'thinking')
  const assistantMessageId = assistantMessage.id

  messages.value.push(userMessage, assistantMessage)
  question.value = ''

  await nextTick()
  scrollToBottom()

  try {
    await askQuestionStream({
      question: text,
      history: requestHistory,
      documentId: selectedDocumentId.value,
      onStart(payload) {
        updateMessage(assistantMessageId, {
          status: 'streaming',
          mode: payload.mode || null,
          questionType: payload.questionType || null,
          routeReason: payload.reason || '',
          planSummary: payload.planSummary || '',
          showCitationState: payload.mode === 'retrieval'
        })
      },
      onCitations(payload) {
        updateMessage(assistantMessageId, {
          citations: payload.citations || []
        })
        scrollToBottom()
      },
      onResult(payload) {
        updateMessage(assistantMessageId, {
          answerSummary: payload.summary || '',
          confidence: Number.isFinite(Number(payload.confidence))
            ? Number(payload.confidence)
            : null
        })
        scrollToBottom()
      },
      onDelta(payload) {
        appendMessageContent(assistantMessageId, payload.content || '')
        updateMessage(assistantMessageId, { status: 'streaming' })
        scrollToBottom()
      },
      onDone() {
        updateMessage(assistantMessageId, { status: 'done' })
      },
      onError(payload) {
        throw new Error(payload.message || '回答失败')
      }
    })
  } catch (error) {
    const target = findMessage(assistantMessageId)
    updateMessage(assistantMessageId, {
      status: 'error',
      content: target?.content || error.message || '回答失败，请稍后重试。'
    })
    pageError.value = error.message || '回答失败，请稍后重试。'
  } finally {
    sending.value = false
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = messageContainer.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}
</script>

<style scoped>
.ask-page {
  --panel-border: rgba(97, 218, 251, 0.22);
  --text-main: #e6f7ff;
  --text-muted: rgba(214, 240, 255, 0.72);
  --danger-bg: rgba(248, 113, 113, 0.14);
  --danger-border: rgba(248, 113, 113, 0.28);
  max-width: 980px;
  min-height: calc(100vh - 180px);
  margin: 0 auto;
  padding: 32px;
  border: 1px solid var(--panel-border);
  border-radius: 28px;
  background: linear-gradient(145deg, rgba(5, 10, 24, 0.96), rgba(7, 19, 38, 0.92));
  color: var(--text-main);
}

.page-header {
  margin-bottom: 22px;
}

.page-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.8rem);
}

.page-header p {
  margin: 10px 0 0;
  max-width: 760px;
  color: var(--text-muted);
  line-height: 1.7;
}

.header-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.header-tags span {
  padding: 8px 14px;
  border: 1px solid rgba(103, 232, 249, 0.2);
  border-radius: 999px;
  background: rgba(10, 26, 51, 0.68);
  color: #baf6ff;
  font-size: 0.85rem;
}

.page-error,
.empty-state {
  margin-bottom: 18px;
  padding: 14px 16px;
  border-radius: 16px;
}

.page-error {
  border: 1px solid var(--danger-border);
  background: var(--danger-bg);
  color: #ffd5d5;
}

.empty-state {
  border: 1px dashed rgba(103, 232, 249, 0.26);
  background: rgba(10, 24, 46, 0.65);
  color: var(--text-muted);
}

.messages-panel {
  height: 56vh;
  min-height: 420px;
  margin-bottom: 22px;
  padding: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 24px;
  background: rgba(8, 19, 38, 0.88);
  overflow-y: auto;
}

.messages-panel :deep(.message-list) {
  display: grid;
  gap: 14px;
}

.messages-panel :deep(.message-item) {
  padding: 16px 18px;
  border: 1px solid rgba(103, 232, 249, 0.14);
  border-radius: 18px;
  background: rgba(8, 18, 36, 0.72);
}

.messages-panel :deep(.message-item.user) {
  margin-left: auto;
  max-width: min(82%, 720px);
  background: linear-gradient(135deg, rgba(15, 52, 96, 0.92), rgba(14, 116, 144, 0.52));
}

.messages-panel :deep(.message-item.assistant) {
  max-width: min(88%, 760px);
}

.messages-panel :deep(.message-role) {
  margin-bottom: 8px;
  color: #7dd3fc;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.messages-panel :deep(.message-content) {
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.messages-panel :deep(.typing-cursor) {
  margin-left: 4px;
  color: #67e8f9;
}

.messages-panel :deep(.message-error) {
  margin-top: 10px;
  color: #fecaca;
  font-size: 0.88rem;
}

.composer {
  padding: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 24px;
  background: rgba(8, 19, 38, 0.7);
}

.document-selector {
  margin-bottom: 14px;
}

.document-selector label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.92rem;
  font-weight: 600;
}

.document-selector select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(103, 232, 249, 0.18);
  border-radius: 14px;
  background: rgba(4, 12, 26, 0.92);
  color: var(--text-main);
  box-sizing: border-box;
}

.document-hint {
  margin: 8px 4px 0;
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.6;
}

.composer textarea {
  width: 100%;
  min-height: 104px;
  padding: 16px 18px;
  border: 1px solid rgba(103, 232, 249, 0.18);
  border-radius: 18px;
  background: rgba(4, 12, 26, 0.92);
  color: var(--text-main);
  line-height: 1.7;
  resize: vertical;
  box-sizing: border-box;
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.clear-button,
.send-button {
  min-width: 120px;
  padding: 12px 22px;
  border-radius: 999px;
  cursor: pointer;
}

.clear-button {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.72);
  color: #dbeafe;
}

.send-button {
  border: 1px solid rgba(103, 232, 249, 0.3);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.96), rgba(59, 130, 246, 0.92));
  color: #03131f;
  font-weight: 700;
}

.send-button:disabled,
.clear-button:disabled,
.document-selector select:disabled,
.composer textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .ask-page {
    padding: 20px;
  }

  .messages-panel {
    height: 50vh;
    min-height: 360px;
  }

  .composer-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .send-button,
  .clear-button {
    width: 100%;
  }

  .messages-panel :deep(.message-item.user),
  .messages-panel :deep(.message-item.assistant) {
    max-width: 100%;
  }
}
</style>
