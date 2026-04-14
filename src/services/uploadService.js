const path = require('path')
const crypto = require('crypto')

const ingestionService = require('./ingestionService')
const documentRepository = require('../repositories/documentRepository')

class UploadService {
  async uploadDocument(file) {
    if (!file || !file.originalname) {
      throw new Error('Invalid file')
    }

    const allowedTypes = ['.pdf', '.txt']
    const extension = path.extname(file.originalname).toLowerCase()

    if (!allowedTypes.includes(extension)) {
      throw new Error('Only PDF and TXT files are supported')
    }

    if (!file.size) {
      throw new Error('File is empty')
    }

    const documentId = crypto.randomUUID()

    await documentRepository.createDocument({
      id: documentId,
      fileName: file.originalname,
      filePath: file.path,
      status: 'processing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    this.processDocument(documentId, file.path, file.originalname).catch(async error => {
      console.error('Processing error:', error)
      await documentRepository.updateDocumentStatus(documentId, 'failed', error.message)
    })

    return {
      documentId,
      fileName: file.originalname,
      status: 'processing'
    }
  }

  async processDocument(documentId, filePath, fileName) {
    await ingestionService.ingestDocument(filePath, fileName, documentId)
  }

  async resumePendingDocuments() {
    const documents = await documentRepository.getAllDocuments()
    const pendingDocuments = documents.filter(document => document.status === 'processing')

    for (const document of pendingDocuments) {
      this.processDocument(document.id, document.filePath, document.fileName).catch(async error => {
        console.error('Resume processing error:', error)
        await documentRepository.updateDocumentStatus(document.id, 'failed', error.message)
      })
    }

    return pendingDocuments.length
  }
}

module.exports = new UploadService()
