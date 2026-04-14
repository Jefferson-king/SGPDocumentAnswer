<template>
  <div class="message-list">
    <div
      v-for="message in messages"
      :key="message.id"
      :class="['message-item', message.role, message.status]"
    >
      <div class="message-head">
        <div class="message-role">
          {{ message.role === 'user' ? '用户' : '助手' }}
        </div>

        <div class="message-badges">
          <div v-if="message.mode" class="message-mode">
            {{ formatMode(message.mode) }}
          </div>
          <div v-if="message.questionType" class="message-mode subtle">
            {{ formatQuestionType(message.questionType) }}
          </div>
        </div>
      </div>

      <div v-if="message.routeReason" class="message-reason">
        {{ message.routeReason }}
      </div>

      <div v-if="message.planSummary" class="message-plan">
        {{ message.planSummary }}
      </div>

      <div class="message-content">
        <template v-if="message.content">
          {{ message.content }}
          <span
            v-if="message.role === 'assistant' && message.status === 'streaming'"
            class="typing-cursor"
          >|</span>
        </template>

        <template v-else-if="message.status === 'streaming'">
          正在生成回答...
        </template>

        <template v-else-if="message.status === 'thinking'">
          正在思考...
        </template>
      </div>

      <div v-if="message.answerSummary || Number.isFinite(message.confidence)" class="message-metrics">
        <div v-if="message.answerSummary" class="metric-card">
          <div class="metric-label">Summary</div>
          <div class="metric-value">{{ message.answerSummary }}</div>
        </div>

        <div v-if="Number.isFinite(message.confidence)" class="metric-card compact">
          <div class="metric-label">Confidence</div>
          <div class="metric-value">{{ formatConfidence(message.confidence) }}</div>
        </div>
      </div>

      <CitationList
        v-if="shouldShowCitationBlock(message)"
        :citations="message.citations || []"
      />

      <div v-if="message.status === 'error'" class="message-error">
        本轮回答失败，请稍后重试。
      </div>
    </div>
  </div>
</template>

<script setup>
import CitationList from './CitationList.vue'

defineProps({
  messages: {
    type: Array,
    default: () => []
  }
})

function formatMode(mode) {
  const map = {
    direct: '直接回答',
    retrieval: '上下文化检索'
  }

  return map[mode] || mode
}

function formatQuestionType(type) {
  const map = {
    fact: '事实问答',
    summary: '总结问答',
    compare: '对比问答',
    followup: '追问问答'
  }

  return map[type] || type
}

function formatConfidence(value) {
  return `${Math.round(Number(value) * 100)}%`
}

function shouldShowCitationBlock(message) {
  if (message.role !== 'assistant') return false
  if (message.citations && message.citations.length > 0) return true

  return (
    message.mode === 'retrieval' &&
    message.showCitationState &&
    ['done', 'error'].includes(message.status)
  )
}
</script>

<style scoped>
.message-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.message-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.message-mode {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(103, 232, 249, 0.12);
  border: 1px solid rgba(103, 232, 249, 0.22);
  color: #9ae6ff;
  font-size: 12px;
  white-space: nowrap;
}

.message-mode.subtle {
  background: rgba(148, 163, 184, 0.08);
  border-color: rgba(148, 163, 184, 0.2);
  color: rgba(214, 240, 255, 0.74);
}

.message-reason,
.message-plan {
  margin-bottom: 8px;
  color: rgba(214, 240, 255, 0.72);
  font-size: 12px;
  line-height: 1.6;
}

.message-plan {
  color: rgba(191, 219, 254, 0.78);
}

.message-metrics {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.metric-card {
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.34);
}

.metric-card.compact {
  max-width: 180px;
}

.metric-label {
  margin-bottom: 6px;
  color: rgba(191, 219, 254, 0.72);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metric-value {
  color: rgba(230, 247, 255, 0.92);
  line-height: 1.7;
}
</style>
