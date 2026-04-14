const queryUnderstandingService = require('./queryUnderstandingService')

async function routeQuestion({ question, history = [], documentId = null }) {
  const plan = await queryUnderstandingService.planQuestion({
    question,
    history,
    documentId
  })

  return {
    mode: plan.routeMode,
    reason: plan.reason,
    plan
  }
}

module.exports = {
  routeQuestion
}
