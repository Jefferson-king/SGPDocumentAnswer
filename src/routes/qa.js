const router = require('express').Router()

const answerService = require('../services/answerService')

router.post('/ask', async (req, res) => {
  const question = req.body?.question?.trim()
  const history = req.body?.history
  const documentId = req.body?.documentId || null

  if (!question) {
    return res.status(400).json({
      ok: false,
      message: '问题不能为空'
    })
  }

  setupSseHeaders(res)

  try {
    const payload = await answerService.getAnswerPayload({
      question,
      history,
      documentId
    })

    writeSse(res, {
      type: 'start',
      mode: payload.mode,
      reason: payload.reason,
      questionType: payload.questionType,
      planSummary: payload.planSummary
    })

    writeSse(res, {
      type: 'citations',
      citations: payload.citations
    })

    writeSse(res, {
      type: 'result',
      summary: payload.result.summary,
      confidence: payload.result.confidence,
      retrieval: payload.retrieval
    })

    for await (const chunk of answerService.streamAnswerText(payload.result.answer)) {
      writeSse(res, {
        type: 'delta',
        content: chunk
      })
    }

    writeSse(res, { type: 'done' })
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (error) {
    writeSse(res, {
      type: 'error',
      message: error.message || '回答生成失败'
    })
    res.end()
  }
})

function setupSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders()
  }
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

module.exports = router
