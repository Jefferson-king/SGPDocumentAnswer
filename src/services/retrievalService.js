const chroma = require('../lib/chroma')
const ollama = require('../lib/ollama')
const ragConfig = require('../config/rag')
const bm25Service = require('./bm25Service')
const { rerankCandidates } = require('./rerankService')
const { buildFinalContext } = require('./contextBuilderService')

const COLLECTION_BY_UNIT = {
  chunk: 'chunks',
  parent: 'parents',
  page: 'pages',
  summary: 'summaries'
}

function unitTypesForPlan(queryPlan) {
  if (queryPlan.globalIntent || queryPlan.questionType === 'summary') {
    return ['summary', 'page', 'parent', 'chunk']
  }

  if (queryPlan.questionType === 'compare') {
    return ['summary', 'parent', 'chunk', 'page']
  }

  return ['chunk', 'parent', 'page']
}

function similarityFromDistance(distance) {
  const numeric = Number(distance)
  if (!Number.isFinite(numeric)) return 0
  return 1 / (1 + numeric)
}

function ensureCandidate(map, seed) {
  if (!map.has(seed.id)) {
    map.set(seed.id, {
      id: seed.id,
      content: seed.content || '',
      rawText: seed.rawText || seed.content || '',
      metadata: seed.metadata || {},
      paths: [],
      scores: {
        vector: 0,
        bm25: 0,
        fused: 0
      }
    })
  }

  return map.get(seed.id)
}

function applyRrfScore(candidate, rank) {
  candidate.scores.fused += 1 / (ragConfig.retrieval.rrfK + rank)
}

async function collectVectorCandidates(queryPlan, unitTypes) {
  const results = []

  for (const query of queryPlan.queries) {
    const embedding = await ollama.generateEmbedding(query.text)
    if (!embedding) continue

    for (const unitType of unitTypes) {
      const collectionName = COLLECTION_BY_UNIT[unitType]
      const queryResults = await chroma.queryCollection(
        collectionName,
        embedding,
        ragConfig.retrieval.vectorTopK,
        queryPlan.constraints.documentId ? { documentId: queryPlan.constraints.documentId } : null
      )

      queryResults.forEach((item, index) => {
        results.push({
          id: item.id,
          content: item.document,
          rawText: item.metadata?.rawText || item.document,
          metadata: item.metadata,
          channel: 'vector',
          rank: index + 1,
          score: similarityFromDistance(item.distance),
          queryLabel: query.label
        })
      })
    }
  }

  return results
}

async function collectBm25Candidates(queryPlan, unitTypes) {
  const results = []

  for (const query of queryPlan.queries) {
    const queryResults = await bm25Service.search(
      query.text,
      ragConfig.retrieval.bm25TopK,
      {
        documentId: queryPlan.constraints.documentId,
        unitTypes
      }
    )

    queryResults.forEach((item, index) => {
      results.push({
        id: item.id,
        content: item.content,
        rawText: item.rawText || item.content,
        metadata: item.metadata,
        channel: 'bm25',
        rank: index + 1,
        score: item.score,
        queryLabel: query.label
      })
    })
  }

  return results
}

function fuseCandidates(vectorCandidates, bm25Candidates) {
  const candidateMap = new Map()

  for (const result of [...vectorCandidates, ...bm25Candidates]) {
    const candidate = ensureCandidate(candidateMap, result)
    candidate.metadata = { ...candidate.metadata, ...result.metadata }
    candidate.paths.push({
      channel: result.channel,
      queryLabel: result.queryLabel,
      rank: result.rank,
      score: result.score
    })

    if (result.channel === 'vector') {
      candidate.scores.vector = Math.max(candidate.scores.vector, result.score)
    }

    if (result.channel === 'bm25') {
      candidate.scores.bm25 = Math.max(candidate.scores.bm25, result.score)
    }

    applyRrfScore(candidate, result.rank)
  }

  return [...candidateMap.values()]
    .sort((left, right) => right.scores.fused - left.scores.fused)
}

async function retrieve(queryPlan) {
  const unitTypes = unitTypesForPlan(queryPlan)
  const [vectorCandidates, bm25Candidates] = await Promise.all([
    collectVectorCandidates(queryPlan, unitTypes),
    bm25Service ? collectBm25Candidates(queryPlan, unitTypes) : Promise.resolve([])
  ])

  const recallCandidates = fuseCandidates(vectorCandidates, bm25Candidates)
  const rerankedCandidates = rerankCandidates(recallCandidates, queryPlan)
  const finalContext = buildFinalContext(rerankedCandidates, queryPlan)

  return {
    queryPlan,
    recallCandidates,
    rerankedCandidates,
    finalContext,
    citations: finalContext.citations,
    retrievalSummary: {
      recallCount: recallCandidates.length,
      rerankedCount: rerankedCandidates.length,
      contextItems: finalContext.stats.items,
      documents: finalContext.stats.documents
    }
  }
}

module.exports = {
  retrieve
}
