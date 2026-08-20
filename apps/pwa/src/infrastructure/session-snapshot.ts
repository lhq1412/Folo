export type SessionSnapshot = {
  userId: string
  name: string
  email: string
}

export const SESSION_SNAPSHOT_STORAGE_KEY = "folo-lite-session-snapshot"

export const readSessionSnapshot = (): SessionSnapshot | null => {
  try {
    const raw = localStorage.getItem(SESSION_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>
    if (typeof parsed.userId !== "string" || parsed.userId.length === 0) return null
    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
      userId: parsed.userId,
    }
  } catch {
    return null
  }
}

export const writeSessionSnapshot = (snapshot: SessionSnapshot) => {
  localStorage.setItem(
    SESSION_SNAPSHOT_STORAGE_KEY,
    JSON.stringify({
      email: snapshot.email,
      name: snapshot.name,
      userId: snapshot.userId,
    }),
  )
}

export const clearSessionSnapshot = () => {
  localStorage.removeItem(SESSION_SNAPSHOT_STORAGE_KEY)
}
