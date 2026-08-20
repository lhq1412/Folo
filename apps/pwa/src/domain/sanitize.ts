import DOMPurify from "dompurify"

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

export const sanitizeEntryContent = (content: string) =>
  DOMPurify.sanitize(content, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: INTERACTIVE_FEED_TAGS,
  })

export const sanitizeSocialListContent = (content: string) =>
  DOMPurify.sanitize(content, {
    FORBID_ATTR: ["style"],
    FORBID_TAGS: SOCIAL_LIST_FORBIDDEN_TAGS,
  })
