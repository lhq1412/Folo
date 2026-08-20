import { FollowClient } from "@follow-app/client-sdk"

import { API_URL } from "./env"

export { API_URL }

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
