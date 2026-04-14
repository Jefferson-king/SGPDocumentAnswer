const MAX_HISTORY_TURNS = 4
const VALID_ROLES = new Set(['user', 'assistant'])

function normalizeHistory(history = []) {
  return history
    .filter(item => item && VALID_ROLES.has(item.role) && typeof item.content === 'string')
    .map(item => ({
      role: item.role,
      content: item.content.trim()
    }))
    .filter(item => item.content)
}

function trimHistory(history = [], maxTurns = MAX_HISTORY_TURNS) {
  return normalizeHistory(history).slice(-maxTurns * 2)
}

function buildHistoryBlock(history = []) {
  const trimmed = trimHistory(history)
  if (!trimmed.length) return '无历史对话'

  return trimmed
    .map((item, index) => `${index + 1}. ${item.role === 'user' ? '用户' : '助手'}: ${item.content}`)
    .join('\n')
}

module.exports = {
  MAX_HISTORY_TURNS,
  normalizeHistory,
  trimHistory,
  buildHistoryBlock
}
