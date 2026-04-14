const ANSWER_SCHEMA = {
  type: 'object',
  required: ['answer', 'citations', 'summary', 'confidence'],
  properties: {
    answer: { type: 'string' },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'source', 'snippet'],
        properties: {
          id: { type: 'string' },
          source: { type: 'string' },
          page: { type: ['number', 'null'] },
          section: { type: ['string', 'null'] },
          chunkId: { type: ['string', 'null'] },
          unitType: { type: ['string', 'null'] },
          snippet: { type: 'string' }
        }
      }
    }
  }
}

function clampConfidence(value, fallback = 0.42) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.max(0, Math.min(1, numeric))
}

function normalizeCitation(citation = {}) {
  return {
    id: String(citation.id || citation.chunkId || 'citation'),
    source: String(citation.source || '未知文档'),
    page: Number.isFinite(Number(citation.page)) ? Number(citation.page) : null,
    section: citation.section ? String(citation.section) : null,
    chunkId: citation.chunkId ? String(citation.chunkId) : null,
    unitType: citation.unitType ? String(citation.unitType) : null,
    snippet: String(citation.snippet || '').trim()
  }
}

function validateAnswerPayload(payload) {
  const errors = []

  if (!payload || typeof payload !== 'object') {
    errors.push('payload must be an object')
    return { valid: false, errors }
  }

  if (typeof payload.answer !== 'string' || !payload.answer.trim()) {
    errors.push('answer must be a non-empty string')
  }

  if (!Array.isArray(payload.citations)) {
    errors.push('citations must be an array')
  }

  if (typeof payload.summary !== 'string') {
    errors.push('summary must be a string')
  }

  if (!Number.isFinite(Number(payload.confidence))) {
    errors.push('confidence must be a number')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

function normalizeAnswerPayload(payload = {}, fallback = {}) {
  const citations = Array.isArray(payload.citations)
    ? payload.citations.map(normalizeCitation).filter(item => item.snippet)
    : Array.isArray(fallback.citations)
      ? fallback.citations.map(normalizeCitation).filter(item => item.snippet)
      : []

  return {
    answer: String(payload.answer || fallback.answer || '').trim(),
    citations,
    summary: String(payload.summary || fallback.summary || '').trim(),
    confidence: clampConfidence(payload.confidence, fallback.confidence)
  }
}

module.exports = {
  ANSWER_SCHEMA,
  validateAnswerPayload,
  normalizeAnswerPayload
}
