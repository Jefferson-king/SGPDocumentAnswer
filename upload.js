const fs = require('fs')
const axios = require('axios')
const FormData = require('form-data')

async function upload() {
  const form = new FormData()
  form.append('file', fs.createReadStream('test.txt'))

  try {
    const response = await axios.post('http://localhost:3000/api/documents/upload', form, {
      headers: form.getHeaders()
    })
    console.log('Upload success:', response.data)
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message)
  }
}

upload()