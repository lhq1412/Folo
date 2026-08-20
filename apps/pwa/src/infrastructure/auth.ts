import { createAuthClient } from "better-auth/react"

import { API_URL } from "./env"

export const authClient = createAuthClient({
  baseURL: `${API_URL}/better-auth`,
  fetchOptions: {
    cache: "no-store",
    credentials: "include",
  },
})
