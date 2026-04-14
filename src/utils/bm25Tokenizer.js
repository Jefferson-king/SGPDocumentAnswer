// BM25 需要把 query 和 chunk 变成 token。
// 英文天然有空格；中文没有，所以这里做一个轻量级中文 token 方案：
// 1. 英文/数字连续串按一个 token 处理
// 2. 中文连续串按 2-gram 切分
// 

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeChineseFragment(fragment) {
  const tokens = []

  if (!fragment) {
    return tokens
  }

  if (fragment.length === 1) {
    tokens.push(fragment)
    return tokens
  }

  for (let index = 0; index < fragment.length - 1; index += 1) {
    tokens.push(fragment.slice(index, index + 2))
  }

  return tokens
}

function tokenizeForBm25(text) {
  const normalized = normalizeText(text)

  if (!normalized) {
    return []
  }

  const fragments = normalized.match(/[\u4e00-\u9fa5]+|[a-z0-9]+/gi) || []
  const tokens = []

  for (const fragment of fragments) {
    if (/^[a-z0-9]+$/i.test(fragment)) {
      tokens.push(fragment)
      continue
    }

    tokens.push(...tokenizeChineseFragment(fragment))
  }

  return tokens
}

module.exports = {
  normalizeText,
  tokenizeForBm25
}
