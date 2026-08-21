import DOMPurify from "dompurify"

import { getReaderImageUrl } from "./media"

const INTERACTIVE_FEED_TAGS = ["button", "form", "input", "option", "select", "textarea"]
const SOCIAL_LIST_FORBIDDEN_TAGS = [
  ...INTERACTIVE_FEED_TAGS,
  "a",
  "audio",
  "iframe",
  "img",
  "source",
  "video",
]

const rewriteReaderImages = (html: string) => {
  if (!html.includes("<img")) return html
  const doc = new DOMParser().parseFromString(html, "text/html")
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src")
    if (src && /^https?:/i.test(src)) {
      img.setAttribute("src", getReaderImageUrl(src))
    }
    img.setAttribute("loading", "lazy")
    img.setAttribute("decoding", "async")
  }
  return doc.body.innerHTML
}

export const sanitizeEntryContent = (content: string) =>
  rewriteReaderImages(
    DOMPurify.sanitize(content, {
      FORBID_ATTR: ["style"],
      FORBID_TAGS: INTERACTIVE_FEED_TAGS,
    }),
  )

export const sanitizeSocialListContent = (content: string) =>
  DOMPurify.sanitize(content, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: SOCIAL_LIST_FORBIDDEN_TAGS,
  })
