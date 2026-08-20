export const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? new URL("/api", window.location.origin).href : "https://api.folo.is")
