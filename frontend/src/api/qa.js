export async function askQuestionStream({
  question,
  history = [],
  documentId = '',
  signal,
  onStart,
  onCitations,
  onResult,
  onDelta,
  onDone,
  onError
}) {
  const response = await fetch('/api/qa/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      question,
      history,
      documentId: documentId || null
    }),
    signal
  })

  if (!response.ok || !response.body) {
    let message = '问答请求失败'

    try {
      const data = await response.json()
      message = data.message || message
    } catch (_) {}

    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const eventText of events) {
      const line = eventText
        .split('\n')
        .find(item => item.startsWith('data:'))

      if (!line) continue

      const raw = line.slice(5).trim()

      if (raw === '[DONE]') {
        onDone?.()
        return
      }

      const payload = JSON.parse(raw)

      if (payload.type === 'start') onStart?.(payload)
      if (payload.type === 'citations') onCitations?.(payload)
      if (payload.type === 'result') onResult?.(payload)
      if (payload.type === 'delta') onDelta?.(payload)

      if (payload.type === 'done') {
        onDone?.()
        return
      }

      if (payload.type === 'error') {
        onError?.(payload)
        throw new Error(payload.message || '流式返回失败')
      }
    }
  }

  onDone?.()
}
