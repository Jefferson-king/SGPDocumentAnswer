module.exports = {
  parser: {
    maxPageCharsForSummary: 600,
    lowTextDensityThreshold: 120,
    titleMaxLength: 40,
    parentBlockMaxChars: 900
  },

  chunking: {
    targetChars: 420,
    maxChars: 560,
    overlapChars: 80,
    maxContextKeywords: 6
  },

  retrieval: {
    enableHybrid: true,
    collections: ['chunks', 'parents', 'pages', 'summaries'],
    vectorTopK: 6,
    bm25TopK: 8,
    finalTopK: 6,
    maxQueryVariants: 6,
    fusionStrategy: 'rrf',
    rrfK: 60,
    maxContextChars: 9000,
    maxCitations: 6,
    diversityPerDocument: 2
  },

  rerank: {
    maxCandidates: 24,
    titleHitBoost: 0.15,
    keywordCoverageBoost: 0.24,
    officialBoost: 0.12,
    latestBoost: 0.1,
    sameDepartmentBoost: 0.16,
    selectedDocumentBoost: 0.24,
    globalSummaryBoost: 0.15,
    compareDiversityBoost: 0.1,
    shortChunkPenalty: 0.08,
    chromePenalty: 0.12
  },

  queryUnderstanding: {
    maxHistoryTurns: 4,
    decompositionLimit: 4,
    enableRewrite: true,
    enableDecomposition: true,
    enableMultiQuery: true,
    enableHyDE: true
  },

  output: {
    answerChunkSize: 120,
    defaultConfidence: 0.42
  }
}
