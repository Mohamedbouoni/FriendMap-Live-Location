<template>
  <div class="auth-page">
    <div class="auth-bg-blob-1"></div>
    <div class="auth-bg-blob-2"></div>

    <div class="auth-card anim-scale-up">
      <!-- Logo -->
      <div class="auth-logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <circle cx="12" cy="11" r="3" />
        </svg>
      </div>

      <h1 class="auth-title">Welcome back</h1>
      <p class="auth-subtitle">Sign in to FriendMap to see your friends</p>

      <!-- Error Alert -->
      <div v-if="authStore.error" class="alert alert-error mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{{ authStore.error }}</span>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="auth-form">
        <div>
          <label class="form-label">Email or Username</label>
          <input
            id="login-identifier"
            v-model="identifier"
            type="text"
            required
            placeholder="alice@example.com or alice"
            class="form-input"
          />
        </div>

        <div>
          <label class="form-label">Password</label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            required
            placeholder="••••••••"
            class="form-input"
          />
        </div>

        <button
          id="login-submit"
          type="submit"
          :disabled="authStore.loading"
          class="btn btn-primary btn-block"
          style="padding: 14px; font-size: 14px; margin-top: 6px;"
        >
          <svg v-if="authStore.loading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="anim-spin">
            <circle cx="12" cy="12" r="10" opacity="0.25" />
            <path d="M4 12a8 8 0 018-8" opacity="0.75" />
          </svg>
          <span>{{ authStore.loading ? 'Signing in…' : 'Sign In' }}</span>
        </button>
      </form>

      <div class="auth-footer">
        Don't have an account?
        <router-link to="/register">Create one now</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const identifier = ref('');
const password = ref('');

async function handleLogin() {
  try {
    await authStore.login({
      identifier: identifier.value,
      password: password.value,
    });
    router.push('/map');
  } catch (err) {
    // Handled in store
  }
}
</script>
