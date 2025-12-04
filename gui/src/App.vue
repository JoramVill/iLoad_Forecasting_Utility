<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>iLoad</h1>
        <div class="subtitle">Forecasting Utility</div>
      </div>
      <nav class="sidebar-nav">
        <RouterLink to="/train" class="nav-item" active-class="active">
          <span class="icon">&#128200;</span>
          Train Model
        </RouterLink>
        <RouterLink to="/forecast" class="nav-item" active-class="active">
          <span class="icon">&#128302;</span>
          Generate Forecast
        </RouterLink>
        <RouterLink to="/evaluate" class="nav-item" active-class="active">
          <span class="icon">&#128202;</span>
          Evaluate
        </RouterLink>
      </nav>
    </aside>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>
