import { FollowClient } from "@follow-app/client-sdk"

export const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? new URL("/api", window.location.origin).href : "https://api.folo.is")

export const followClient = new FollowClient({
  baseURL: API_URL,
  credentials: "include",
  timeout: 60_000,
  fetch: async (input, options = {}) =>
    fetch(input.toString(), {
      ...options,
      cache: "no-store",
    }),
})

export const followApi = followClient.api
