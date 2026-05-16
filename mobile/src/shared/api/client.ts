// Re-export the shared axios instance so feature code imports from `shared/api`
// instead of reaching into `lib/`. This is the single HTTP client for the app —
// it already attaches the auth token and handles 401s.
export { api, getApiBaseUrl, setUnauthorizedHandler } from '../../lib/api';
