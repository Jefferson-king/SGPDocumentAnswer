const { ChromaClient } = require('chromadb')

const COLLECTION_PREFIX = process.env.CHROMA_COLLECTION_PREFIX || 'sgp_rag'

class ChromaService {
  constructor() {
    this.client = new ChromaClient({
      path: process.env.CHROMA_URL || 'http://localhost:8000'
    })
    this.collectionCache = new Map()
  }

  getCollectionName(name) {
    return `${COLLECTION_PREFIX}_${name}`
  }

  async getCollection(name) {
    const collectionName = this.getCollectionName(name)

    if (this.collectionCache.has(collectionName)) {
      return this.collectionCache.get(collectionName)
    }

    try {
      const collection = await this.client.getOrCreateCollection({
        name: collectionName
      })
      this.collectionCache.set(collectionName, collection)
      return collection
    } catch (error) {
      console.error(`Chroma collection error (${collectionName}):`, error.message)
      return null
    }
  }

  async upsertRecords(collectionName, records = []) {
    if (!records.length) return false

    const collection = await this.getCollection(collectionName)
    if (!collection) return false

    try {
      await collection.upsert({
        ids: records.map(record => record.id),
        embeddings: records.map(record => record.embedding).filter(Boolean).length
          ? records.map(record => record.embedding || [])
          : undefined,
        metadatas: records.map(record => this.sanitizeMetadata(record.metadata)),
        documents: records.map(record => record.document)
      })

      return true
    } catch (error) {
      console.error(`Chroma upsert error (${collectionName}):`, error.message)
      return false
    }
  }

  async queryCollection(collectionName, embedding, nResults = 5, where = null) {
    if (!embedding) return []

    const collection = await this.getCollection(collectionName)
    if (!collection) return []

    try {
      const payload = {
        queryEmbeddings: [embedding],
        nResults,
        include: ['documents', 'metadatas', 'distances']
      }

      if (where && Object.keys(where).length > 0) {
        payload.where = where
      }

      const result = await collection.query(payload)
      const ids = result?.ids?.[0] || []
      const documents = result?.documents?.[0] || []
      const metadatas = result?.metadatas?.[0] || []
      const distances = result?.distances?.[0] || []

      return ids.map((id, index) => ({
        id,
        document: documents[index] || '',
        metadata: metadatas[index] || {},
        distance: distances[index] ?? null,
        collection: collectionName
      }))
    } catch (error) {
      console.error(`Chroma query error (${collectionName}):`, error.message)
      return []
    }
  }

  sanitizeMetadata(metadata = {}) {
    const sanitized = {}

    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined) continue
      if (value === null) {
        sanitized[key] = null
        continue
      }

      if (Array.isArray(value)) {
        sanitized[key] = value
          .map(item => String(item).trim())
          .filter(Boolean)
          .join(' | ')
        continue
      }

      if (typeof value === 'object') {
        sanitized[key] = JSON.stringify(value)
        continue
      }

      sanitized[key] = value
    }

    return sanitized
  }
}

module.exports = new ChromaService()
