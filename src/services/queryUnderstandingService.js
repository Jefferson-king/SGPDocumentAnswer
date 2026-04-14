const ragConfig = require('../config/rag')
const { tokenizeForBm25 } = require('../utils/bm25Tokenizer')

const DEPARTMENTS = ['调控', '配电', '营销', '规划', '通信', '运检', '安监', '财务', '设备', '发展', '调度']

function trimHistory(history = []) {
  return history
    .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .map(item => ({ role: item.role, content: item.content.trim() }))
    .filter(item => item.content)
    .slice(-ragConfig.queryUnderstanding.maxHistoryTurns * 2)
}

function detectQuestionType(question, history = []) {
  const text = String(question || '').trim()
  const hasHistory = history.length > 0

  if (/(总结|概括|综述|核心变化|主要变化|整体看|全库|所有文档|整套制度)/.test(text)) {
    return 'summary'
  }

  if (/(区别|差异|对比|比较|相比|分别|优缺点)/.test(text)) {
    return 'compare'
  }

  if (hasHistory && /(它|这个|上面|刚才|前面|继续|进一步|那么|那这个|这一点)/.test(text)) {
    return 'followup'
  }

  return 'fact'
}

function detectGlobalIntent(question, documentId) {
  if (documentId) return false

  return /(全库|所有文档|整套制度|整体|各部门|部门之间|A部门|B部门|多个文档|核心变化|差异在哪)/.test(question)
}

function inferDepartments(question) {
  return DEPARTMENTS.filter(item => question.includes(item))
}

function isDirectOnlyQuestion(question) {
  return /^(你好|你是谁|谢谢|再见|hi|hello)/i.test(question) ||
    /(翻译一下|润色一下|写一段|写封邮件)/.test(question)
}

function rewriteWithHistory(question, history = []) {
  const trimmedHistory = trimHistory(history)
  if (!trimmedHistory.length) return question

  const lastUserQuestion = [...trimmedHistory]
    .reverse()
    .find(item => item.role === 'user')
    ?.content

  if (!lastUserQuestion) return question

  if (/(它|这个|上面|前面|继续|进一步|再展开|那这个)/.test(question)) {
    return `基于上一个问题“${lastUserQuestion}”，继续回答：${question}`
  }

  return question
}

function buildDecomposition(questionType, standaloneQuestion) {
  if (questionType !== 'compare' && !/(以及|并且|同时|分别|变化|原因|影响|流程)/.test(standaloneQuestion)) {
    return []
  }

  const parts = standaloneQuestion
    .split(/[？?；;。]/)
    .flatMap(part => part.split(/以及|并且|同时|分别|和|与/))
    .map(part => part.trim())
    .filter(Boolean)

  return [...new Set(parts)].slice(0, ragConfig.queryUnderstanding.decompositionLimit)
}

function buildKeywordRewrite(question) {
  const keywords = [...new Set(tokenizeForBm25(question))].slice(0, 10)
  return keywords.join(' ')
}

function buildHyDE(questionType, standaloneQuestion, departments) {
  const departmentHint = departments.length ? `，重点涉及${departments.join('、')}部门` : ''

  if (questionType === 'summary') {
    return `这是一段用于检索的假设答案：文档集合围绕制度、流程、职责和时间变化展开${departmentHint}，需要总结核心变化、关键条款和适用范围。`
  }

  if (questionType === 'compare') {
    return `这是一段用于检索的假设答案：问题关注多个对象之间的差异与共性${departmentHint}，应覆盖流程步骤、职责边界、制度口径和时间要求。`
  }

  return `这是一段用于检索的假设答案：需要围绕“${standaloneQuestion}”找到直接事实、制度依据、页面出处和相关上下文${departmentHint}。`
}

function dedupeQueries(queries) {
  const seen = new Set()
  const results = []

  for (const query of queries) {
    const key = query.text.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(query)
  }

  return results.slice(0, ragConfig.retrieval.maxQueryVariants)
}

async function planQuestion({ question, history = [], documentId = null }) {
  const trimmedHistory = trimHistory(history)
  const standaloneQuestion = rewriteWithHistory(question, trimmedHistory)
  const questionType = detectQuestionType(question, trimmedHistory)
  const globalIntent = detectGlobalIntent(question, documentId)
  const departments = inferDepartments(standaloneQuestion)
  const decomposition = buildDecomposition(questionType, standaloneQuestion)
  const keywordRewrite = buildKeywordRewrite(standaloneQuestion)

  const queries = dedupeQueries([
    { label: 'original', text: question, purpose: 'preserve-user-wording' },
    ragConfig.queryUnderstanding.enableRewrite
      ? { label: 'rewrite', text: standaloneQuestion, purpose: 'standalone-rewrite' }
      : null,
    ragConfig.queryUnderstanding.enableMultiQuery && keywordRewrite
      ? { label: 'keywords', text: keywordRewrite, purpose: 'keyword-recall' }
      : null,
    ...decomposition.map((text, index) => ({
      label: `decomposition_${index + 1}`,
      text,
      purpose: 'multi-hop-decomposition'
    })),
    ragConfig.queryUnderstanding.enableHyDE
      ? {
          label: 'hyde',
          text: buildHyDE(questionType, standaloneQuestion, departments),
          purpose: 'hypothetical-document'
        }
      : null
  ].filter(Boolean))

  const routeMode = isDirectOnlyQuestion(question)
    ? 'direct'
    : 'retrieval'
  const complexity = decomposition.length > 1 || globalIntent || questionType === 'compare'
    ? 'complex'
    : 'simple'

  const constraints = {
    documentId: documentId || null,
    departments,
    preferLatest: /(最新|最近|当前|现行)/.test(standaloneQuestion) || globalIntent,
    preferOfficial: /(制度|办法|规定|通知|正式|口径)/.test(standaloneQuestion) || true,
    globalIntent
  }

  return {
    rawQuestion: question,
    standaloneQuestion,
    questionType,
    routeMode,
    globalIntent,
    complexity,
    decomposition,
    queries,
    constraints,
    reason: globalIntent
      ? '识别为全库级或跨文档问题，启用 summary/page/chunk 多路召回'
      : questionType === 'compare'
        ? '识别为对比类问题，启用问题拆解与多路召回'
        : questionType === 'summary'
          ? '识别为总结类问题，优先召回摘要、页级与父块内容'
          : questionType === 'followup'
            ? '识别为追问，已结合最近对话重写为独立检索问题'
            : routeMode === 'retrieval'
              ? '识别为事实型文档问答，启用上下文化检索'
              : '识别为普通对话，走直接回答链路',
    planSummary: [
      `类型:${questionType}`,
      `范围:${globalIntent ? '全库' : documentId ? '指定文档' : '知识库'}`,
      `复杂度:${complexity}`,
      queries.length ? `检索路数:${queries.length}` : ''
    ]
      .filter(Boolean)
      .join(' | ')
  }
}

module.exports = {
  planQuestion,
  trimHistory
}
