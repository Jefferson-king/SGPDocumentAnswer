require('dotenv').config()

const cors = require('cors')
const express = require('express')

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/documents', require('./routes/documents'))
app.use('/api/qa', require('./routes/qa'))
app.use('/health', require('./routes/health'))

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({
    ok: false,
    message: err.message || '服务器内部错误'
  })
})

module.exports = app
