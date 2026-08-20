import { useEffect, useState } from "react"

export const getOnlineStatus = () => (typeof navigator === "undefined" ? true : navigator.onLine)

export function useOnlineStatus() {
  const [online, setOnline] = useState(getOnlineStatus)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  return online
}
