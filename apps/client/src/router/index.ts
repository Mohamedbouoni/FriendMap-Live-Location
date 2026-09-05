import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import AppShell from '../components/AppShell.vue';
import MapView from '../views/MapView.vue';
import FriendsPage from '../views/FriendsPage.vue';
import TrailPage from '../views/TrailPage.vue';
import SettingsPage from '../views/SettingsPage.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterView,
    meta: { public: true },
  },
  {
    path: '/',
    component: AppShell,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/map' },
      { path: 'map', name: 'Map', component: MapView },
      { path: 'friends', name: 'Friends', component: FriendsPage },
      { path: 'trail', name: 'Trail', component: TrailPage },
      { path: 'settings', name: 'Settings', component: SettingsPage },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/map',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('access_token');
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);
  const isPublic = to.matched.some((record) => record.meta.public);

  if (requiresAuth && !token) {
    next({ name: 'Login' });
  } else if (isPublic && token) {
    next({ name: 'Map' });
  } else {
    next();
  }
});

export default router;
