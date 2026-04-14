export const MAX_HISTORY_TURNS = 4
// 用于准备发给AI模型的最终消息列表
export function toRequestHistory(messages, maxTurns = MAX_HISTORY_TURNS) {
  return (messages || [])
    .filter(message => message.includeInHistory !== false)
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .filter(message => typeof message.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role,
      content: message.content.trim()
    }))
    .slice(-maxTurns * 2)
}
