async function parseJsonSafely(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch (_) {
    throw new Error(`Invalid server response (${response.status})`)
  }
}

export async function uploadDocument(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/documents/upload', {
    method: 'POST',
    body: formData
  })

  const data = await parseJsonSafely(response)

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || 'Upload failed')
  }

  return data
}

export async function fetchDocumentStatus(documentId) {
  const response = await fetch(`/api/documents/${documentId}/status`)
  const data = await parseJsonSafely(response)

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || 'Failed to get document status')
  }

  return data.document
}

export async function fetchDocuments() {
  const response = await fetch('/api/documents')
  const data = await parseJsonSafely(response)

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || 'Failed to get document list')
  }

  return data.documents || []
}
