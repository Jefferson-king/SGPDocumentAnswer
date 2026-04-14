const app = require('./app')
const uploadService = require('./services/uploadService')

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)

  uploadService.resumePendingDocuments()
    .then(count => {
      if (count > 0) {
        console.log(`Resumed ${count} processing document(s)`)
      }
    })
    .catch(error => {
      console.error('Failed to resume pending documents:', error.message)
    })
})
