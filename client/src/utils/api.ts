import axios from 'axios';
import { getAuthHeaders } from './auth';

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

export default api;



