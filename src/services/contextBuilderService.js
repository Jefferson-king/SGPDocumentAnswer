const ragConfig = require('../config/rag')
const structuredParserService = require('./structuredParserServiceV2')

function takeFirst(text, maxLength = 220) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

function formatContextItem(item) {
  return [
    `来源:${item.source}`,
    `单元:${item.unitType}`,
    `页码:${item.page ?? '未知'}`,
    `章节:${item.section || '未分类'}`,
    item.role ? `角色:${item.role}` : '',
    item.text
  ]
    .filter(Boolean)
    .join('\n')
}

function buildCitation(item) {
  return {
    id: item.id,
    source: item.source,
    page: item.page ?? null,
    section: item.section || null,
    chunkId: item.chunkId || item.id,
    unitType: item.unitType || null,
    snippet: takeFirst(item.text, 180)
  }
}

function getNeighborChunks(parsed, anchor) {
  const chunks = parsed?.chunks || []
  const index = chunks.findIndex(chunk => chunk.id === anchor.id)
  if (index === -1) return []

  return [chunks[index - 1], chunks[index + 1]]
    .filter(Boolean)
    .filter(chunk => chunk.parentId === anchor.metadata?.parentId)
    .map(chunk => ({
      id: `${chunk.id}_neighbor`,
      chunkId: chunk.chunkId,
      unitType: 'chunk',
      role: 'neighbor',
      source: chunk.source,
      page: chunk.page,
      section: chunk.section,
      text: chunk.rawText
    }))
}

function buildAnchorContext(parsed, candidate) {
  const { metadata = {} } = candidate
  const items = [{
    id: candidate.id,
    chunkId: metadata.chunkId || candidate.id,
    unitType: metadata.unitType || 'chunk',
    role: 'anchor',
    source: metadata.source || metadata.documentName || '未知文档',
    page: metadata.page ?? null,
    section: metadata.section || null,
    text: candidate.rawText || candidate.content
  }]

  if (!parsed) {
    return items
  }

  if (metadata.unitType === 'chunk') {
    const parent = parsed.parentBlocks?.find(item => item.parentId === metadata.parentId)
    const page = parsed.pages?.find(item => item.id === metadata.pageId)

    if (parent) {
      items.push({
        id: `${parent.id}_parent_context`,
        unitType: 'parent',
        role: 'parent',
        source: parent.documentName,
        page: parent.page,
        section: parent.section,
        text: takeFirst(parent.rawText, 320)
      })
    }

    if (page?.summary) {
      items.push({
        id: `${page.id}_page_context`,
        unitType: 'page',
        role: 'page',
        source: metadata.source || parsed.document?.fileName || '未知文档',
        page: page.pageNumber,
        section: metadata.section || null,
        text: page.summary
      })
    }

    items.push(...getNeighborChunks(parsed, candidate))
  }

  return items
}

function shouldKeepItem(item, state, queryPlan) {
  if (state.usedIds.has(item.id)) return false

  if (queryPlan.questionType === 'compare' && item.role === 'anchor') {
    const currentCount = state.docCounts.get(item.source) || 0
    if (currentCount >= ragConfig.retrieval.diversityPerDocument) {
      return false
    }
  }

  return true
}

function addItem(item, state) {
  const nextLength = state.totalChars + item.text.length
  if (nextLength > ragConfig.retrieval.maxContextChars) {
    return false
  }

  state.items.push(item)
  state.totalChars = nextLength
  state.usedIds.add(item.id)
  if (item.role === 'anchor') {
    state.docCounts.set(item.source, (state.docCounts.get(item.source) || 0) + 1)
  }
  return true
}

function buildFinalContext(rerankedCandidates, queryPlan) {
  const state = {
    items: [],
    totalChars: 0,
    usedIds: new Set(),
    docCounts: new Map()
  }

  for (const candidate of rerankedCandidates) {
    const parsed = structuredParserService.loadParsedDocument(candidate.metadata?.documentId)
    const contextItems = buildAnchorContext(parsed, candidate)

    for (const item of contextItems) {
      if (!shouldKeepItem(item, state, queryPlan)) continue
      if (!addItem(item, state)) break
    }

    const anchors = state.items.filter(item => item.role === 'anchor')
    if (anchors.length >= ragConfig.retrieval.finalTopK) {
      break
    }
  }

  const citations = state.items
    .filter(item => item.role === 'anchor')
    .slice(0, ragConfig.retrieval.maxCitations)
    .map(buildCitation)

  return {
    items: state.items,
    citations,
    contextText: state.items.map(formatContextItem).join('\n\n'),
    stats: {
      items: state.items.length,
      anchors: state.items.filter(item => item.role === 'anchor').length,
      documents: [...state.docCounts.keys()]
    }
  }
}

module.exports = {
  buildFinalContext
}
