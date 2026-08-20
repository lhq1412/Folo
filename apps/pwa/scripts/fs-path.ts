import { fileURLToPath, pathToFileURL } from "node:url"

export const appRootFromScript = (scriptUrl: string) => fileURLToPath(new URL("..", scriptUrl))

export const joinRoot = (root: string, ...segments: string[]) =>
  fileURLToPath(new URL(segments.join("/"), pathToFileURL(root.endsWith("/") ? root : `${root}/`)))

export const relativePosix = (from: string, to: string) => {
  const prefix = from.endsWith("/") ? from : `${from}/`
  if (!to.startsWith(prefix)) return to.replaceAll("\\", "/")
  return to.slice(prefix.length).replaceAll("\\", "/")
}
