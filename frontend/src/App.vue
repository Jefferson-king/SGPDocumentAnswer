<template>
  <div id="app">
    <nav class="navbar">
      <h1>AI 知识库问答系统</h1>
      <ul class="nav-links">
        <li><RouterLink to="/upload">上传文档</RouterLink></li>
        <li><RouterLink to="/ask">问答</RouterLink></li>
        <li><RouterLink to="/documents">文档列表</RouterLink></li>
      </ul>
    </nav>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<style scoped>
#app {
  font-family: Arial, sans-serif;
  min-height: 100vh;
  background: #f9fafb;
}

.navbar {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.navbar h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #2563eb;
}

.nav-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 2rem;
}

.nav-links a {
  text-decoration: none;
  color: #6b7280;
  font-weight: 500;
  transition: color 0.2s ease;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  color: #2563eb;
}

.main-content {
  max-width: 1200px;
  margin: 2rem auto;
}
</style>
