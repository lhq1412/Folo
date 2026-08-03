export type UnsavedWorkSurface = "ai_chat" | "search" | "settings_form"

export type UnsavedWorkCheckResult = {
  hasUnsavedWork: boolean
  surfaces: UnsavedWorkSurface[]
}

function hasUnsentAiChatInput(): boolean {
  const chatInput = document.querySelector('[data-testid="chat-input"]')
  if (!chatInput) {
    return false
  }

  const text = chatInput.textContent?.trim() ?? ""
  return text.length > 0
}

function hasOpenSearchQuery(): boolean {
  const searchInput = document.querySelector<HTMLInputElement>("[cmdk-input]")
  if (!searchInput) {
    return false
  }

  return searchInput.value.trim().length > 0
}

function hasDirtySettingsForm(): boolean {
  const settingsRoot = document.querySelector('[data-testid="settings-modal"]')
  if (!settingsRoot) {
    return false
  }

  const dirtyInputs = settingsRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input[data-dirty='true'], textarea[data-dirty='true']",
  )

  return dirtyInputs.length > 0
}

export function detectUnsavedWork(): UnsavedWorkCheckResult {
  const surfaces: UnsavedWorkSurface[] = []

  if (hasUnsentAiChatInput()) {
    surfaces.push("ai_chat")
  }

  if (hasOpenSearchQuery()) {
    surfaces.push("search")
  }

  if (hasDirtySettingsForm()) {
    surfaces.push("settings_form")
  }

  return {
    hasUnsavedWork: surfaces.length > 0,
    surfaces,
  }
}
