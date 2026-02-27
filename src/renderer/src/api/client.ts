import axios from 'axios'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (error.response?.data?.needSetup) {
        window.location.hash = '/login'
      } else {
        window.location.hash = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
