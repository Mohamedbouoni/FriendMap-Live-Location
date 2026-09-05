<template>
  <div class="auth-page">
    <div class="auth-bg-blob-1"></div>
    <div class="auth-bg-blob-2"></div>

    <div class="auth-card anim-scale-up">
      <!-- Logo -->
      <div class="auth-logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      </div>

      <h1 class="auth-title">Create Account</h1>
      <p class="auth-subtitle">Join FriendMap and stay connected privately</p>

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
      <form @submit.prevent="handleRegister" class="auth-form">
        <div>
          <label class="form-label">Email Address</label>
          <input
            id="register-email"
            v-model="email"
            type="email"
            required
            placeholder="alice@example.com"
            class="form-input"
          />
        </div>

        <div>
          <label class="form-label">Username</label>
          <input
            id="register-username"
            v-model="username"
            type="text"
            required
            minlength="3"
            maxlength="30"
            placeholder="alice"
            class="form-input"
          />
          <p class="form-hint">3–30 characters (letters, numbers, _, -)</p>
        </div>

        <div>
          <label class="form-label">Password</label>
          <input
            id="register-password"
            v-model="password"
            type="password"
            required
            minlength="6"
            placeholder="At least 6 characters"
            class="form-input"
          />
        </div>

        <button
          id="register-submit"
          type="submit"
          :disabled="authStore.loading"
          class="btn btn-primary btn-block"
          style="padding: 14px; font-size: 14px; margin-top: 6px;"
        >
          <svg v-if="authStore.loading" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="anim-spin">
            <circle cx="12" cy="12" r="10" opacity="0.25" />
            <path d="M4 12a8 8 0 018-8" opacity="0.75" />
          </svg>
          <span>{{ authStore.loading ? 'Creating Account…' : 'Register Account' }}</span>
        </button>
      </form>

      <div class="auth-footer">
        Already have an account?
        <router-link to="/login">Sign in here</router-link>
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

const email = ref('');
const username = ref('');
const password = ref('');

async function handleRegister() {
  try {
    await authStore.register({
      email: email.value,
      username: username.value,
      password: password.value,
    });
    router.push('/map');
  } catch (err) {
    // Handled in store
  }
}
</script>
