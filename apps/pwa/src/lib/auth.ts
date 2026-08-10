import { createAuthClient } from "better-auth/react"

const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? new URL("/api", window.location.origin).href : "https://api.folo.is")

export const authClient = createAuthClient({
  baseURL: `${API_URL}/better-auth`,
  fetchOptions: {
    cache: "no-store",
    credentials: "include",
  },
})
