const axios = require('axios')

class OllamaService {
  constructor() {
    this.baseURL = process.env.OLLAMA_URL || 'http://localhost:11434'
    this.model = process.env.OLLAMA_MODEL || 'qwen2.5:7b'
    this.embeddingModel =
      process.env.OLLAMA_EMBED_MODEL || 'chroma/all-minilm-l6-v2-f32:latest'
  }

  async generateEmbedding(text) {
    const prompt = String(text || '').trim().slice(0, 2400)
    if (!prompt) return null

    try {
      const response = await axios.post(
        `${this.baseURL}/api/embed`,
        {
          model: this.embeddingModel,
          input: prompt
        },
        {
          timeout: 120000
        }
      )

      return response.data?.embeddings?.[0] || response.data?.embedding || null
    } catch (embedError) {
      try {
        const response = await axios.post(
          `${this.baseURL}/api/embeddings`,
          {
            model: this.embeddingModel,
            prompt
          },
          {
            timeout: 120000
          }
        )

        return response.data?.embedding || null
      } catch (legacyError) {
        console.error('Embedding generation failed:', legacyError.message || embedError.message)
        return null
      }
    }
  }

  async generateCompletion(prompt, options = {}) {
    const response = await axios.post(
      `${this.baseURL}/api/generate`,
      {
        model: options.model || this.model,
        prompt,
        stream: false,
        format: options.format,
        options: options.options
      },
      {
        timeout: options.timeoutMs || 180000
      }
    )

    return response.data?.response?.trim() || ''
  }
}

module.exports = new OllamaService()
