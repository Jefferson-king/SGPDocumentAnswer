const fs = require('fs')
const path = require('path')
const { PDFParse } = require('pdf-parse')

const ragConfig = require('../config/rag')
const { tokenizeForBm25 } = require('../utils/bm25Tokenizer')

const PARSED_DIR = path.join(__dirname, '..', '..', 'data', 'parsed')

const STOPWORDS = new Set([
  '的', '了', '和', '是', '在', '与', '及', '对', '按', '将', '等', '中',
  '有关', '相关', '工作', '管理', '要求', '实施', '推进', '方案', '规定', '制度'
])

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function cleanText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\t+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildSafeId(...parts) {
  return parts
    .filter(Boolean)
    .join('_')
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '_')
}

function takeFirst(text, maxLength) {
  const value = String(text || '').trim()
  if (!value) return ''
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

function inferDepartment(fileName, text) {
  const source = `${fileName}\n${text}`
  const patterns = ['调控', '配电', '营销', '规划', '通信', '运检', '安监', '财务', '设备', '发展', '调度']

  for (const pattern of patterns) {
    if (source.includes(pattern)) return pattern
  }

  return '通用'
}

function inferDocType(fileName, text) {
  const source = `${fileName}\n${text}`

  if (/(制度|办法|规定|条例|细则)/.test(source)) return '制度'
  if (/(流程|指引|指南|手册)/.test(source)) return '流程'
  if (/(方案|规划|研究)/.test(source)) return '方案'
  if (/(纪要|总结|汇报|交流)/.test(source)) return '报告'
  if (/(通知|通报|公告)/.test(source)) return '通知'

  return '资料'
}

function inferAuthorityLevel(docType, fileName) {
  if (/(正式|制度|办法|规定|通知)/.test(`${docType}${fileName}`)) return 'official'
  if (/(研究|汇报|交流)/.test(fileName)) return 'reference'
  return 'general'
}

function buildKeywordList(text, limit = 8) {
  const counts = new Map()

  for (const token of tokenizeForBm25(text)) {
    if (!token || STOPWORDS.has(token) || token.length <= 1) continue
    counts.set(token, (counts.get(token) || 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([token]) => token)
}

class StructuredParserServiceV2 {
  async parseDocument(filePath, { documentId, fileName, createdAt }) {
    const pages = await this.readPages(filePath)
    const fullText = pages.map(page => page.text).join('\n\n')
    const docType = inferDocType(fileName, fullText)

    const documentMeta = {
      id: documentId,
      fileName,
      createdAt,
      department: inferDepartment(fileName, fullText),
      docType,
      authorityLevel: inferAuthorityLevel(docType, fileName),
      keywords: buildKeywordList(fullText, 12)
    }

    const structuredPages = pages.map(page => this.buildPage(page, documentMeta))
    this.markRepeatedHeadersAndFooters(structuredPages)

    const parentBlocks = this.buildParentBlocks(structuredPages, documentMeta)
    const chunks = this.buildChunks(parentBlocks, structuredPages, documentMeta)
    const summaryUnit = this.buildSummaryUnit(structuredPages, parentBlocks, chunks, documentMeta)
    const graph = this.buildKnowledgeGraph(structuredPages, summaryUnit, documentMeta)

    return {
      document: documentMeta,
      pages: structuredPages,
      parentBlocks,
      chunks,
      summaryUnit,
      graph
    }
  }

  async readPages(filePath) {
    const extension = path.extname(filePath).toLowerCase()

    if (extension === '.txt') {
      return [{
        pageNumber: 1,
        text: cleanText(fs.readFileSync(filePath, 'utf8'))
      }]
    }

    if (extension !== '.pdf') {
      throw new Error('Unsupported file type')
    }

    const dataBuffer = fs.readFileSync(filePath)
    const parser = new PDFParse({ data: dataBuffer })

    try {
      const info = await parser.getInfo({ parsePageInfo: true })
      const totalPages = info.total || info.pages?.length || 0
      const pages = []

      if (!totalPages) {
        const result = await parser.getText()
        pages.push({ pageNumber: 1, text: cleanText(result.text || '') })
      } else {
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
          const result = await parser.getText({ partial: [pageNumber] })
          pages.push({ pageNumber, text: cleanText(result.text || '') })
        }
      }

      return pages.filter(page => page.text)
    } finally {
      await parser.destroy()
    }
  }

  buildPage(page, documentMeta) {
    const blocks = this.extractBlocks(page.text, page.pageNumber, documentMeta)
    const bodyBlocks = blocks.filter(block => !['header', 'footer', 'pageNumber'].includes(block.type))
    const pageSummary = takeFirst(
      bodyBlocks.slice(0, 3).map(block => block.text).join(' '),
      ragConfig.parser.maxPageCharsForSummary
    )

    return {
      id: buildSafeId(documentMeta.id, 'page', page.pageNumber),
      pageNumber: page.pageNumber,
      text: page.text,
      summary: pageSummary,
      keywords: buildKeywordList(page.text, 8),
      visualSuggested: page.text.length < ragConfig.parser.lowTextDensityThreshold,
      blocks
    }
  }

  extractBlocks(pageText, pageNumber, documentMeta) {
    const lines = pageText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    const blocks = []
    let paragraphLines = []
    let paragraphStart = 0
    let currentSection = documentMeta.fileName
    let blockIndex = 0
    let cursor = 0

    const flushParagraph = () => {
      if (!paragraphLines.length) return

      const text = paragraphLines.join(' ')
      blocks.push({
        id: buildSafeId(documentMeta.id, 'page', pageNumber, 'block', blockIndex),
        type: 'paragraph',
        text,
        page: pageNumber,
        order: blockIndex,
        section: currentSection,
        startOffset: paragraphStart,
        endOffset: paragraphStart + text.length
      })

      blockIndex += 1
      paragraphLines = []
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const prevLine = lines[index - 1] || ''
      const nextLine = lines[index + 1] || ''
      const type = this.classifyLine(line, index, lines.length, prevLine, nextLine)

      if (type === 'paragraph') {
        if (!paragraphLines.length) paragraphStart = cursor
        paragraphLines.push(line)
        cursor += line.length + 1
        continue
      }

      flushParagraph()

      const block = {
        id: buildSafeId(documentMeta.id, 'page', pageNumber, 'block', blockIndex),
        type,
        text: line,
        page: pageNumber,
        order: blockIndex,
        section: currentSection,
        startOffset: cursor,
        endOffset: cursor + line.length
      }

      if (type === 'title' && this.isStructuralTitle(line)) {
        currentSection = line
        block.section = currentSection
      }

      blocks.push(block)
      blockIndex += 1
      cursor += line.length + 1
    }

    flushParagraph()

    return blocks.map(block => ({
      ...block,
      modalities: this.inferModalities(block.type),
      keywords: buildKeywordList(block.text, 4)
    }))
  }

  classifyLine(line, lineIndex, totalLines, prevLine = '', nextLine = '') {
    if (/^(--\s*)?\d+(\s*of\s*\d+)?(\s*--)?$/i.test(line)) return 'pageNumber'
    if (/^(figure|图)\s*[0-9一二三四五六七八九十]+/i.test(line)) return 'figureCaption'
    if (/^(table|表)\s*[0-9一二三四五六七八九十]+/i.test(line)) return 'table'
    if (/[=+\-*/<>≤≥≈]/.test(line) || /[A-Za-z]\s*=\s*[A-Za-z0-9]/.test(line)) return 'formula'
    if (/\|/.test(line) || /\t/.test(line) || /(\S+\s{2,}\S+\s{2,}\S+)/.test(line)) return 'table'
    if (lineIndex === 0 && line.length <= 18 && !/[。；！？]/.test(line)) return 'header'
    if (lineIndex === totalLines - 1 && line.length <= 18 && !/[。；！？]/.test(line)) return 'footer'
    if (this.isLikelyTitle(line, prevLine, nextLine)) return 'title'

    return 'paragraph'
  }

  isLikelyTitle(line, prevLine = '', nextLine = '') {
    const text = String(line || '').trim()

    if (!text) return false
    if (text.length > ragConfig.parser.titleMaxLength) return false
    if (/[。；！？：:，,]$/.test(text)) return false

    const numberedHeading =
      /^[第]?\s*[一二三四五六七八九十百千\d]+[\s、.．章节部分条款项]/.test(text) ||
      /^[（(]?[一二三四五六七八九十\d]+[)）][\s\S]+/.test(text)

    if (numberedHeading) return true
    if (/^\d{4}年\d{1,2}月$/.test(text)) return true
    if (text.length < 6) return false
    if (/\s{2,}/.test(text)) return false
    if (/[，,；;：:]/.test(text)) return false
    if (/\d{5,}/.test(text)) return false

    const fragmentedSentence =
      text.length <= 20 &&
      !/\s/.test(text) &&
      prevLine &&
      nextLine &&
      prevLine.length <= 20 &&
      nextLine.length <= 20

    if (fragmentedSentence) return false

    return /(图|表|附件|附录|概述|背景|现状|原则|思路|方案|规划|目标|路径|体系|架构|措施|机制|情况|分析|总结|建议|应用|流程|指引|指南|逻辑图|框架)/.test(text) ||
      (text.length <= 18 && !/\s/.test(text))
  }

  isStructuralTitle(text) {
    const value = String(text || '').trim()
    if (!value) return false

    return /^[第]?\s*[一二三四五六七八九十百千\d]+[\s、.．章节部分条款项]/.test(value) ||
      /^[（(]?[一二三四五六七八九十\d]+[)）]/.test(value) ||
      /(概述|背景|原则|方案|规划|目标|路径|体系|架构|措施|情况|分析|总结|建议|应用|流程|逻辑图|框架)$/.test(value)
  }

  inferModalities(type) {
    if (type === 'table') return ['text', 'table']
    if (type === 'figureCaption') return ['text', 'caption']
    if (type === 'formula') return ['text', 'formula']
    return ['text']
  }

  markRepeatedHeadersAndFooters(pages) {
    const firstCounts = new Map()
    const lastCounts = new Map()

    for (const page of pages) {
      const first = page.blocks[0]?.text
      const last = page.blocks[page.blocks.length - 1]?.text
      if (first && first.length <= 30) firstCounts.set(first, (firstCounts.get(first) || 0) + 1)
      if (last && last.length <= 30) lastCounts.set(last, (lastCounts.get(last) || 0) + 1)
    }

    for (const page of pages) {
      const first = page.blocks[0]
      const last = page.blocks[page.blocks.length - 1]

      if (first && (firstCounts.get(first.text) || 0) >= 2) first.type = 'header'
      if (last && (lastCounts.get(last.text) || 0) >= 2) last.type = 'footer'
    }
  }

  buildParentBlocks(pages, documentMeta) {
    const parents = []
    let parentIndex = 0

    for (const page of pages) {
      let currentBlocks = []
      let currentChars = 0

      const flush = () => {
        if (!currentBlocks.length) return

        const first = currentBlocks[0]
        const last = currentBlocks[currentBlocks.length - 1]
        const text = currentBlocks.map(block => block.text).join('\n')

        parents.push({
          id: buildSafeId(documentMeta.id, 'parent', parentIndex),
          parentId: buildSafeId(documentMeta.id, 'parent', parentIndex),
          unitType: 'parent',
          documentId: documentMeta.id,
          documentName: documentMeta.fileName,
          page: first.page,
          pageId: page.id,
          section: first.section,
          order: parentIndex,
          blockTypes: [...new Set(currentBlocks.map(block => block.type))],
          childBlockIds: currentBlocks.map(block => block.id),
          startOffset: first.startOffset,
          endOffset: last.endOffset,
          text,
          rawText: text,
          keywords: buildKeywordList(text, 6),
          visualSuggested: currentBlocks.some(block => block.modalities.includes('caption') || block.modalities.includes('table'))
        })

        parentIndex += 1
        currentBlocks = []
        currentChars = 0
      }

      for (const block of page.blocks) {
        const structuralTitle =
          block.type === 'title' &&
          this.isStructuralTitle(block.text) &&
          block.text.length >= 6

        const shouldFlush =
          currentBlocks.length > 0 &&
          (
            currentChars + block.text.length > ragConfig.parser.parentBlockMaxChars ||
            structuralTitle ||
            currentBlocks[currentBlocks.length - 1].section !== block.section
          )

        if (shouldFlush) flush()

        currentBlocks.push(block)
        currentChars += block.text.length
      }

      flush()
    }

    return parents
  }

  buildChunks(parentBlocks, pages, documentMeta) {
    const pageLookup = new Map(pages.map(page => [page.id, page]))
    const chunks = []
    let chunkIndex = 0

    for (const parent of parentBlocks) {
      const parentChunks = this.splitText(parent.rawText)

      for (let index = 0; index < parentChunks.length; index += 1) {
        const rawText = parentChunks[index]
        const page = pageLookup.get(parent.pageId)
        const chunkKeywords = buildKeywordList(rawText, ragConfig.chunking.maxContextKeywords)
        const chunkContext = [
          `文档:${documentMeta.fileName}`,
          `类型:${documentMeta.docType}`,
          `部门:${documentMeta.department}`,
          `页码:${parent.page}`,
          `章节:${parent.section || '未分类'}`,
          `父块:${takeFirst(parent.rawText, 120)}`,
          `块类型:${parent.blockTypes.join('/')}`,
          `关键词:${chunkKeywords.join('、') || documentMeta.keywords.slice(0, 4).join('、')}`,
          `页摘要:${takeFirst(page?.summary, 120)}`
        ].join('\n')

        chunks.push({
          id: buildSafeId(documentMeta.id, 'chunk', chunkIndex),
          chunkId: buildSafeId(documentMeta.id, 'chunk', chunkIndex),
          unitType: 'chunk',
          documentId: documentMeta.id,
          documentName: documentMeta.fileName,
          source: documentMeta.fileName,
          page: parent.page,
          pageId: parent.pageId,
          parentId: parent.parentId,
          section: parent.section,
          blockTypes: parent.blockTypes,
          chunkIndex,
          parentChunkIndex: index,
          text: `${chunkContext}\n\n正文:\n${rawText}`.trim(),
          rawText,
          chunkContext,
          startOffset: parent.startOffset,
          endOffset: parent.endOffset,
          keywords: chunkKeywords,
          visualSuggested: parent.visualSuggested
        })

        chunkIndex += 1
      }
    }

    return chunks
  }

  splitText(text) {
    const clean = cleanText(text)
    if (!clean) return []
    if (clean.length <= ragConfig.chunking.maxChars) return [clean]

    const chunks = []
    let start = 0

    while (start < clean.length) {
      let end = Math.min(start + ragConfig.chunking.maxChars, clean.length)
      const slice = clean.slice(start, end)
      const sentenceBreak = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('\n'))

      if (sentenceBreak > ragConfig.chunking.targetChars / 2) {
        end = start + sentenceBreak + 1
      }

      chunks.push(clean.slice(start, end).trim())

      if (end >= clean.length) break
      start = Math.max(end - ragConfig.chunking.overlapChars, start + 1)
    }

    return chunks.filter(Boolean)
  }

  buildSummaryUnit(pages, parentBlocks, chunks, documentMeta) {
    const titles = pages
      .flatMap(page => page.blocks)
      .filter(block => block.type === 'title')
      .map(block => block.text)
      .slice(0, 8)

    const highlights = parentBlocks
      .map(parent => takeFirst(parent.text, 140))
      .slice(0, 6)

    const summaryText = [
      `文档:${documentMeta.fileName}`,
      `类型:${documentMeta.docType}`,
      `部门:${documentMeta.department}`,
      `权威级别:${documentMeta.authorityLevel}`,
      `高频主题:${documentMeta.keywords.slice(0, 8).join('、')}`,
      titles.length ? `章节概览:${titles.join(' | ')}` : '',
      highlights.length ? `核心片段:${highlights.join(' || ')}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    return {
      id: buildSafeId(documentMeta.id, 'summary'),
      unitType: 'summary',
      documentId: documentMeta.id,
      documentName: documentMeta.fileName,
      source: documentMeta.fileName,
      page: null,
      section: '文档摘要',
      text: summaryText,
      rawText: summaryText,
      chunkId: null,
      parentId: null,
      pageId: null,
      keywords: documentMeta.keywords.slice(0, 10),
      stats: {
        pages: pages.length,
        parents: parentBlocks.length,
        chunks: chunks.length
      }
    }
  }

  buildKnowledgeGraph(pages, summaryUnit, documentMeta) {
    const sectionNodes = pages
      .flatMap(page => page.blocks)
      .filter(block => block.type === 'title')
      .slice(0, 12)
      .map(block => ({
        id: buildSafeId(documentMeta.id, 'section', block.order, block.page),
        label: block.text,
        page: block.page
      }))

    const keywordNodes = documentMeta.keywords.slice(0, 12).map(keyword => ({
      id: buildSafeId(documentMeta.id, 'keyword', keyword),
      label: keyword
    }))

    return {
      summary: summaryUnit.text,
      nodes: {
        document: {
          id: buildSafeId(documentMeta.id, 'document'),
          label: documentMeta.fileName
        },
        sections: sectionNodes,
        keywords: keywordNodes
      },
      edges: [
        ...sectionNodes.map(section => ({
          source: buildSafeId(documentMeta.id, 'document'),
          target: section.id,
          type: 'contains'
        })),
        ...keywordNodes.map(keyword => ({
          source: buildSafeId(documentMeta.id, 'document'),
          target: keyword.id,
          type: 'mentions'
        }))
      ]
    }
  }

  saveParsedDocument(documentId, payload) {
    ensureDir(PARSED_DIR)
    fs.writeFileSync(
      path.join(PARSED_DIR, `${documentId}.json`),
      JSON.stringify(payload, null, 2),
      'utf8'
    )
  }

  loadParsedDocument(documentId) {
    const filePath = path.join(PARSED_DIR, `${documentId}.json`)
    if (!fs.existsSync(filePath)) return null

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (_) {
      return null
    }
  }
}

module.exports = new StructuredParserServiceV2()
