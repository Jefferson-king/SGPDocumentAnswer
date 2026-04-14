const fs = require('fs')
const path = require('path')

const ragConfig = require('../config/rag')
const { normalizeText, tokenizeForBm25 } = require('../utils/bm25Tokenizer')

const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const INDEX_FILE = path.join(DATA_DIR, `${ragConfig.retrieval.bm25IndexFile || 'bm25-index'}.json`)

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readIndex() {
  ensureDir()

  if (!fs.existsSync(INDEX_FILE)) {
    return {
      avgDocLength: 0,
      docCount: 0,
      docs: [],
      termDocFrequency: {}
    }
  }

  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
  } catch (_) {
    return {
      avgDocLength: 0,
      docCount: 0,
      docs: [],
      termDocFrequency: {}
    }
  }
}

function writeIndex(index) {
  ensureDir()
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8')
}

function buildTermFrequency(tokens) {
  const tf = {}

  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1
  }

  return tf
}

function buildIndex(docs) {
  const termDocFrequency = {}
  let totalLength = 0

  for (const doc of docs) {
    totalLength += doc.length
    const uniqueTokens = new Set(doc.tokens)

    for (const token of uniqueTokens) {
      termDocFrequency[token] = (termDocFrequency[token] || 0) + 1
    }
  }

  return {
    docCount: docs.length,
    avgDocLength: docs.length ? totalLength / docs.length : 0,
    termDocFrequency,
    docs
  }
}

function normalizeRecord(record) {
  const searchText = String(record.searchText || record.document || record.text || '').trim()
  const tokens = tokenizeForBm25(searchText)

  return {
    id: record.id,
    documentId: record.metadata?.documentId || record.documentId || null,
    unitType: record.metadata?.unitType || record.unitType || 'chunk',
    source: record.metadata?.source || record.source || '',
    metadata: record.metadata || {},
    document: searchText,
    rawText: record.rawText || record.metadata?.rawText || '',
    tokens,
    length: tokens.length,
    tf: buildTermFrequency(tokens)
  }
}

class BM25Service {
  async upsertDocuments(records = []) {
    if (!records.length) return

    const currentIndex = readIndex()
    const incomingIds = new Set(records.map(record => record.id))
    const existingDocs = currentIndex.docs.filter(doc => !incomingIds.has(doc.id))
    const nextDocs = [
      ...existingDocs,
      ...records.map(normalizeRecord).filter(doc => doc.tokens.length)
    ]

    writeIndex(buildIndex(nextDocs))
  }

  async search(query, topK = 5, options = {}) {
    const normalizedQuery = normalizeText(query)
    const queryTokens = tokenizeForBm25(normalizedQuery)
    const index = readIndex()

    if (!queryTokens.length || !index.docs.length) {
      return []
    }

    const scored = index.docs
      .filter(doc => this.matchesFilter(doc, options))
      .map(doc => {
        const score = this.scoreDocument(queryTokens, doc, index)
        const exactBoost = doc.document.includes(normalizedQuery) ? 0.3 : 0

        return {
          id: doc.id,
          content: doc.document,
          metadata: doc.metadata,
          rawText: doc.rawText,
          score: score + exactBoost
        }
      })
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)

    return scored
  }

  matchesFilter(doc, options) {
    if (options.documentId && doc.documentId !== options.documentId) {
      return false
    }

    if (Array.isArray(options.unitTypes) && options.unitTypes.length > 0) {
      return options.unitTypes.includes(doc.unitType)
    }

    return true
  }

  scoreDocument(queryTokens, doc, index) {
    const { k1 = 1.5, b = 0.75 } = ragConfig.retrieval.bm25 || {}
    let score = 0

    for (const token of queryTokens) {
      const frequency = doc.tf[token] || 0
      if (!frequency) continue

      const documentFrequency = index.termDocFrequency[token] || 0
      const idf = Math.log(1 + (index.docCount - documentFrequency + 0.5) / (documentFrequency + 0.5))
      const numerator = frequency * (k1 + 1)
      const denominator =
        frequency +
        k1 * (1 - b + b * (doc.length / (index.avgDocLength || 1)))

      score += idf * (numerator / denominator)
    }

    return score
  }
}

module.exports = new BM25Service()
