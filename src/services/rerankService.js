const ragConfig = require('../config/rag')
const { tokenizeForBm25 } = require('../utils/bm25Tokenizer')

function computeCoverageScore(queryText, candidateText) {
  const queryTokens = [...new Set(tokenizeForBm25(queryText))]
  if (!queryTokens.length) return 0

  const candidateTokens = new Set(tokenizeForBm25(candidateText))
  const hits = queryTokens.filter(token => candidateTokens.has(token))
  return hits.length / queryTokens.length
}

function normalizeDateScore(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0

  const days = (Date.now() - timestamp) / (1000 * 60 * 60 * 24)
  if (days <= 7) return 1
  if (days <= 30) return 0.85
  if (days <= 90) return 0.65
  if (days <= 180) return 0.45
  return 0.2
}

function isOfficial(metadata = {}) {
  return ['official', 'reference'].includes(metadata.authorityLevel) || /(制度|办法|规定|通知)/.test(metadata.docType || '')
}

function isChromeBlock(metadata = {}) {
  const blockTypes = metadata.blockTypes || []
  return blockTypes.includes('header') || blockTypes.includes('footer') || blockTypes.includes('pageNumber')
}

function rerankCandidates(candidates, queryPlan) {
  return candidates
    .map(candidate => {
      const coverage = computeCoverageScore(queryPlan.standaloneQuestion, `${candidate.content}\n${candidate.metadata?.section || ''}`)
      const titleHit = candidate.metadata?.section && queryPlan.standaloneQuestion.includes(candidate.metadata.section) ? 1 : 0
      const officialScore = isOfficial(candidate.metadata) ? 1 : 0
      const sameDepartmentScore = queryPlan.constraints.departments.length === 0
        ? 0
        : queryPlan.constraints.departments.includes(candidate.metadata?.department) ? 1 : 0
      const latestScore = queryPlan.constraints.preferLatest
        ? normalizeDateScore(candidate.metadata?.createdAt)
        : 0
      const selectedDocumentScore = queryPlan.constraints.documentId && candidate.metadata?.documentId === queryPlan.constraints.documentId
        ? 1
        : 0
      const globalSummaryScore =
        queryPlan.globalIntent && ['summary', 'page', 'parent'].includes(candidate.metadata?.unitType)
          ? 1
          : 0
      const shortPenalty = (candidate.rawText || '').length < 80 ? 1 : 0
      const chromePenalty = isChromeBlock(candidate.metadata) ? 1 : 0

      const rerankScore =
        (candidate.scores?.fused || 0) +
        coverage * ragConfig.rerank.keywordCoverageBoost +
        titleHit * ragConfig.rerank.titleHitBoost +
        officialScore * ragConfig.rerank.officialBoost +
        sameDepartmentScore * ragConfig.rerank.sameDepartmentBoost +
        latestScore * ragConfig.rerank.latestBoost +
        selectedDocumentScore * ragConfig.rerank.selectedDocumentBoost +
        globalSummaryScore * ragConfig.rerank.globalSummaryBoost -
        shortPenalty * ragConfig.rerank.shortChunkPenalty -
        chromePenalty * ragConfig.rerank.chromePenalty

      return {
        ...candidate,
        scores: {
          ...candidate.scores,
          coverage,
          rerank: rerankScore
        },
        rerankReasons: [
          coverage ? `coverage:${coverage.toFixed(2)}` : '',
          titleHit ? 'section-hit' : '',
          officialScore ? 'official-doc' : '',
          sameDepartmentScore ? 'same-department' : '',
          selectedDocumentScore ? 'selected-document' : '',
          latestScore ? `latest:${latestScore.toFixed(2)}` : '',
          globalSummaryScore ? 'global-summary-boost' : '',
          shortPenalty ? 'short-penalty' : '',
          chromePenalty ? 'chrome-penalty' : ''
        ].filter(Boolean)
      }
    })
    .sort((left, right) => right.scores.rerank - left.scores.rerank)
    .slice(0, ragConfig.rerank.maxCandidates)
}

module.exports = {
  rerankCandidates
}
