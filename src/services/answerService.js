const ollama = require('../lib/ollama')
const retrievalService = require('./retrievalService')
const queryUnderstandingService = require('./queryUnderstandingService')
const { buildHistoryBlock } = require('./chatHistoryService')
const { normalizeAnswerPayload, validateAnswerPayload } = require('../schemas/answerSchema')
const ragConfig = require('../config/rag')

function buildTemplateInstruction(questionType) {
  switch (questionType) {
    case 'summary':
      return '请优先总结核心变化、关键结论、适用范围和风险提示。'
    case 'compare':
      return '请按“共同点 / 差异点 / 结论建议”结构回答，并明确涉及的文档或部门。'
    case 'followup':
      return '请承接上文，不要重复过多背景，但要补足必要依据。'
    default:
      return '请先给直接结论，再给依据和必要补充。'
  }
}

function buildOutputInstruction() {
  return [
    '你必须只返回 JSON，不要使用 Markdown 代码块。',
    'JSON 字段固定为 answer、summary、confidence。',
    'answer 是完整回答正文。',
    'summary 是 1-2 句浓缩摘要。',
    'confidence 是 0 到 1 之间的数字，保守估计即可。'
  ].join('\n')
}

function buildDirectPrompt({ question, history, queryPlan }) {
  return [
    '你是企业知识库助手。',
    buildTemplateInstruction(queryPlan.questionType),
    buildOutputInstruction(),
    `问题类型: ${queryPlan.questionType}`,
    `检索规划: ${queryPlan.planSummary}`,
    `历史对话:\n${buildHistoryBlock(history)}`,
    `当前问题: ${question}`,
    '请直接回答；如果涉及无法验证的事实，要明确说明不确定。'
  ].join('\n\n')
}

function buildRetrievalPrompt({ question, history, queryPlan, retrievalResult }) {
  return [
    '你是企业级 RAG 问答助手。',
    '你必须严格依据提供的检索上下文回答，不能编造不存在的制度条款或数字。',
    buildTemplateInstruction(queryPlan.questionType),
    buildOutputInstruction(),
    `问题类型: ${queryPlan.questionType}`,
    `查询理解: ${queryPlan.reason}`,
    `检索规划: ${queryPlan.planSummary}`,
    `召回摘要: ${JSON.stringify(retrievalResult.retrievalSummary)}`,
    `历史对话:\n${buildHistoryBlock(history)}`,
    `最终上下文:\n${retrievalResult.finalContext.contextText || '无上下文'}`,
    `当前问题: ${question}`,
    '如果证据不足，请在 answer 中明确写出“依据不足”，并降低 confidence。'
  ].join('\n\n')
}

function safeJsonParse(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const fenced = raw.replace(/```json|```/gi, '').trim()
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  try {
    return JSON.parse(fenced.slice(start, end + 1))
  } catch (_) {
    return null
  }
}

function computeConfidence(queryPlan, retrievalResult) {
  if (!retrievalResult) {
    return queryPlan.routeMode === 'direct' ? 0.46 : ragConfig.output.defaultConfidence
  }

  const anchorCount = retrievalResult.finalContext.citations.length
  const recallCount = retrievalResult.recallCandidates.length
  const topScore = retrievalResult.rerankedCandidates[0]?.scores?.rerank || 0

  const confidence =
    0.28 +
    Math.min(anchorCount, 4) * 0.08 +
    Math.min(recallCount, 10) * 0.015 +
    Math.min(topScore, 1.2) * 0.18

  return Math.max(0.18, Math.min(0.92, confidence))
}

function buildFallbackAnswer(question, queryPlan, retrievalResult) {
  if (!retrievalResult || !retrievalResult.finalContext.items.length) {
    return {
      answer: `当前无法从知识库中找到足够证据来回答“${question}”。`,
      summary: '当前证据不足，建议换一种问法或补充目标文档。',
      confidence: 0.24
    }
  }

  const anchorSnippets = retrievalResult.finalContext.citations
    .slice(0, 3)
    .map(citation => `${citation.source}${citation.page ? ` 第${citation.page}页` : ''}: ${citation.snippet}`)
    .join('\n')

  return {
    answer: [
      '以下回答为基于检索片段的保守整理：',
      anchorSnippets,
      '',
      `围绕“${question}”，当前最相关的证据已经列出，建议结合引用片段继续确认。`
    ].join('\n'),
    summary: `${queryPlan.questionType}问题已返回最相关证据片段，可继续追问细节。`,
    confidence: computeConfidence(queryPlan, retrievalResult) * 0.78
  }
}

async function generateStructuredAnswer(prompt, fallback) {
  try {
    const raw = await ollama.generateCompletion(prompt)
    const parsed = safeJsonParse(raw)

    if (!parsed) {
      return fallback
    }

    const candidate = normalizeAnswerPayload(parsed, fallback)
    const validation = validateAnswerPayload({
      ...candidate,
      citations: fallback.citations || []
    })

    return validation.valid
      ? candidate
      : fallback
  } catch (error) {
    console.error('Answer generation failed:', error.message)
    return fallback
  }
}

async function getAnswerPayload({ question, history = [], documentId = null }) {
  const queryPlan = await queryUnderstandingService.planQuestion({
    question,
    history,
    documentId
  })

  let retrievalResult = null

  if (queryPlan.routeMode === 'retrieval') {
    retrievalResult = await retrievalService.retrieve(queryPlan)
  }

  const citations = retrievalResult?.citations || []
  const fallback = normalizeAnswerPayload({
    ...buildFallbackAnswer(question, queryPlan, retrievalResult),
    citations
  }, {
    citations,
    confidence: computeConfidence(queryPlan, retrievalResult)
  })

  const prompt = queryPlan.routeMode === 'retrieval'
    ? buildRetrievalPrompt({ question, history, queryPlan, retrievalResult })
    : buildDirectPrompt({ question, history, queryPlan })

  const modelAnswer = await generateStructuredAnswer(prompt, fallback)
  const result = normalizeAnswerPayload({
    ...modelAnswer,
    citations,
    confidence: modelAnswer.confidence ?? computeConfidence(queryPlan, retrievalResult)
  }, fallback)

  return {
    mode: queryPlan.routeMode,
    reason: queryPlan.reason,
    questionType: queryPlan.questionType,
    planSummary: queryPlan.planSummary,
    citations,
    retrieval: retrievalResult?.retrievalSummary || null,
    result
  }
}

async function* streamAnswerText(text) {
  const content = String(text || '')

  for (let index = 0; index < content.length; index += ragConfig.output.answerChunkSize) {
    yield content.slice(index, index + ragConfig.output.answerChunkSize)
  }
}

module.exports = {
  getAnswerPayload,
  streamAnswerText
}
