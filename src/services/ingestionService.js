const chroma = require('../lib/chroma')
const ollama = require('../lib/ollama')
const bm25Service = require('./bm25Service')
const structuredParserService = require('./structuredParserServiceV2')
const documentRepository = require('../repositories/documentRepository')

function takeFirst(text, maxLength = 280) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

function chunkContextPrefix(document, unit) {
  return [
    `文档:${document.fileName}`,
    `类型:${document.docType}`,
    `部门:${document.department}`,
    `权威级别:${document.authorityLevel}`,
    `单元:${unit.unitType}`,
    unit.page ? `页码:${unit.page}` : '',
    unit.section ? `章节:${unit.section}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function toSearchRecord(document, unit, overrideText = null) {
  const documentText = overrideText || [chunkContextPrefix(document, unit), unit.text || unit.rawText].filter(Boolean).join('\n\n')

  return {
    id: unit.id,
    unitType: unit.unitType,
    rawText: unit.rawText || unit.text || '',
    searchText: documentText,
    metadata: {
      documentId: document.id,
      documentName: document.fileName,
      source: document.fileName,
      unitType: unit.unitType,
      page: unit.page ?? null,
      pageId: unit.pageId || null,
      section: unit.section || null,
      parentId: unit.parentId || null,
      chunkId: unit.chunkId || null,
      blockTypes: unit.blockTypes || [],
      department: document.department,
      docType: document.docType,
      authorityLevel: document.authorityLevel,
      createdAt: document.createdAt,
      keywords: unit.keywords || document.keywords || [],
      rawText: unit.rawText || unit.text || ''
    }
  }
}

async function attachEmbeddings(records, concurrency = 4) {
  if (!records.length) return []

  const enriched = new Array(records.length)
  let cursor = 0

  async function worker() {
    while (cursor < records.length) {
      const index = cursor
      cursor += 1

      const record = records[index]
      const embedding = await ollama.generateEmbedding(record.searchText)
      enriched[index] = {
        ...record,
        embedding
      }
    }
  }

  const workerCount = Math.min(concurrency, records.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return enriched
}

class IngestionService {
  async ingestDocument(filePath, fileName, documentId) {
    const existingDocument = await documentRepository.getDocumentById(documentId)

    if (!existingDocument) {
      throw new Error('Document record not found')
    }

    const parsed = await structuredParserService.parseDocument(filePath, {
      documentId,
      fileName,
      createdAt: existingDocument.createdAt
    })

    structuredParserService.saveParsedDocument(documentId, parsed)

    const documentMeta = {
      ...parsed.document,
      fileName
    }

    const chunkRecords = parsed.chunks.map(chunk => toSearchRecord(documentMeta, chunk, chunk.text))
    const parentRecords = parsed.parentBlocks.map(parent => toSearchRecord(documentMeta, parent, [
      chunkContextPrefix(documentMeta, parent),
      `父块摘要:${takeFirst(parent.rawText, 220)}`,
      parent.rawText
    ].join('\n\n')))
    const pageRecords = parsed.pages.map(page => toSearchRecord(documentMeta, {
      id: page.id,
      unitType: 'page',
      page: page.pageNumber,
      pageId: page.id,
      section: page.blocks.find(block => block.type === 'title')?.text || '页级内容',
      blockTypes: [...new Set(page.blocks.map(block => block.type))],
      keywords: page.keywords,
      rawText: page.text,
      text: [
        `页摘要:${page.summary}`,
        page.visualSuggested ? '提示: 该页文本稀疏，复杂 PDF 可追加视觉理解路径。' : '',
        takeFirst(page.text, 1200)
      ].filter(Boolean).join('\n')
    }))
    const summaryRecords = [toSearchRecord(documentMeta, {
      ...parsed.summaryUnit,
      unitType: 'summary'
    })]

    const allRecords = [
      ...chunkRecords,
      ...parentRecords,
      ...pageRecords,
      ...summaryRecords
    ]

    const embeddedRecords = await attachEmbeddings(allRecords)

    await Promise.all([
      chroma.upsertRecords('chunks', embeddedRecords.filter(record => record.unitType === 'chunk' && record.embedding).map(record => ({
        id: record.id,
        embedding: record.embedding,
        metadata: record.metadata,
        document: record.searchText
      }))),
      chroma.upsertRecords('parents', embeddedRecords.filter(record => record.unitType === 'parent' && record.embedding).map(record => ({
        id: record.id,
        embedding: record.embedding,
        metadata: record.metadata,
        document: record.searchText
      }))),
      chroma.upsertRecords('pages', embeddedRecords.filter(record => record.unitType === 'page' && record.embedding).map(record => ({
        id: record.id,
        embedding: record.embedding,
        metadata: record.metadata,
        document: record.searchText
      }))),
      chroma.upsertRecords('summaries', embeddedRecords.filter(record => record.unitType === 'summary' && record.embedding).map(record => ({
        id: record.id,
        embedding: record.embedding,
        metadata: record.metadata,
        document: record.searchText
      }))),
      bm25Service.upsertDocuments(embeddedRecords)
    ])

    await documentRepository.updateDocument(documentId, {
      status: 'ready',
      error: null,
      department: parsed.document.department,
      docType: parsed.document.docType,
      authorityLevel: parsed.document.authorityLevel,
      keywords: parsed.document.keywords,
      summary: takeFirst(parsed.summaryUnit.text, 500),
      graph: parsed.graph,
      ingestionStats: {
        pages: parsed.pages.length,
        parentBlocks: parsed.parentBlocks.length,
        chunks: parsed.chunks.length,
        indexUnits: allRecords.length
      }
    })

    return {
      documentId,
      pages: parsed.pages.length,
      chunks: parsed.chunks.length,
      indexUnits: allRecords.length
    }
  }
}

module.exports = new IngestionService()
