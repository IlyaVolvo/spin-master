import axios from 'axios';
import {
  DEFAULT_AUTH_EXPIRED_MESSAGE,
  getAuthHeaders,
  handleAuthExpired,
  isSessionAuthFailure,
} from './auth';

// Use relative path to leverage Vite proxy, or absolute URL if VITE_API_URL is set
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Important: Send cookies (sessions) with requests
  timeout: 10000, // 10 second timeout
});

api.interceptors.request.use((config) => {
  const headers = getAuthHeaders();
  Object.assign(config.headers, headers);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const requestUrl = String(error?.config?.url || error?.config?.baseURL || '');

    if (isSessionAuthFailure(status, data, requestUrl)) {
      const message =
        (typeof data?.error === 'string' && data.error.trim()) ||
        DEFAULT_AUTH_EXPIRED_MESSAGE;
      handleAuthExpired(message);
    }

    return Promise.reject(error);
  }
);

export default api;
