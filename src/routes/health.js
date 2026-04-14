const router = require('express').Router()

router.get('/', (req, res) => {
  res.json({ ok: true, message: 'Service is healthy' })
})

module.exports = router
