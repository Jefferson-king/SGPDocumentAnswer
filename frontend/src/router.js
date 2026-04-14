import { createRouter, createWebHistory } from 'vue-router'
import UploadPage from './pages/UploadPage.vue'
import AskPage from './pages/AskPage.vue'
import DocumentsPage from './pages/DocumentsPage.vue'
import UploadDropzone from './components/UploadDropzone.vue'
const routes = [
  {
    path: '/',
    redirect: '/upload'
  },
  {
    path: '/upload',
    name: 'Upload',
    component: UploadPage
  },
 {
    path: '/UploadDropzone',
    name: 'UploadDropzone',
    component: UploadDropzone
 },
  {
    path: '/ask',
    name: 'Ask',
    component: AskPage
  },
  {
    path: '/documents',
    name: 'Documents',
    component: DocumentsPage
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
