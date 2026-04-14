const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const STORE_FILE = path.join(DATA_DIR, 'documents.json')

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, '[]', 'utf8')
  }
}

function readDocuments() {
  ensureStore()

  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))
  } catch (_) {
    return []
  }
}

function writeDocuments(documents) {
  ensureStore()
  fs.writeFileSync(STORE_FILE, JSON.stringify(documents, null, 2), 'utf8')
}

function normalizeDocument(document) {
  if (!document) return null

  return {
    ...document,
    createdAt: document.createdAt
      ? new Date(document.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: document.updatedAt
      ? new Date(document.updatedAt).toISOString()
      : new Date().toISOString()
  }
}

class DocumentRepository {
  async createDocument(document) {
    const documents = readDocuments()
    const normalized = normalizeDocument(document)
    documents.push(normalized)
    writeDocuments(documents)
    return normalized
  }

  async getDocumentById(id) {
    return readDocuments().find(document => document.id === id) || null
  }

  async updateDocument(id, patch = {}) {
    const documents = readDocuments()
    const index = documents.findIndex(document => document.id === id)

    if (index === -1) {
      return null
    }

    documents[index] = normalizeDocument({
      ...documents[index],
      ...patch,
      updatedAt: new Date().toISOString()
    })

    writeDocuments(documents)
    return documents[index]
  }

  async updateDocumentStatus(id, status, error = null, extra = {}) {
    const patch = {
      status,
      error: error || null,
      ...extra
    }

    return this.updateDocument(id, patch)
  }

  async getAllDocuments() {
    return readDocuments()
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map(document => ({ ...document }))
  }
}

module.exports = new DocumentRepository()
