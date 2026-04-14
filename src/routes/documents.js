const router = require('express').Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')

const uploadService = require('../services/uploadService')
const documentRepository = require('../repositories/documentRepository')

function normalizeFileName(fileName) {
  return Buffer.from(fileName, 'latin1').toString('utf8')
}

function looksLikeMojibake(fileName) {
  return /[\u00C0-\u017F]/.test(fileName)
}

function formatFileName(fileName) {
  if (!fileName) return fileName

  if (!looksLikeMojibake(fileName)) {
    return fileName
  }

  try {
    return normalizeFileName(fileName)
  } catch (_) {
    return fileName
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const originalName = formatFileName(file.originalname)
    file.originalname = originalName
    cb(null, `${Date.now()}-${originalName}`)
  }
})

const upload = multer({ storage })

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (req.file?.originalname) {
      req.file.originalname = formatFileName(req.file.originalname)
    }

    const result = await uploadService.uploadDocument(req.file)
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message })
  }
})

router.get('/:id/status', async (req, res) => {
  try {
    const document = await documentRepository.getDocumentById(req.params.id)

    if (!document) {
      return res.status(404).json({ ok: false, message: 'Document not found' })
    }

    res.json({
      ok: true,
      document: {
        ...document,
        fileName: formatFileName(document.fileName)
      }
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message || 'Failed to get document status'
    })
  }
})

router.get('/', async (req, res) => {
  try {
    const documents = await documentRepository.getAllDocuments()
    res.json({
      ok: true,
      documents: documents.map(document => ({
        ...document,
        fileName: formatFileName(document.fileName)
      }))
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message || 'Failed to get documents'
    })
  }
})

module.exports = router
