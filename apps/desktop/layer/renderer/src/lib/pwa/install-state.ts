const PWA_INSTALL_STORAGE_KEY = "folo-pwa-install-v1"
const PWA_INSTALL_STORAGE_VERSION = 1

export const PWA_INSTALL_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000
export const PWA_INSTALL_MIN_VISITS = 2
export const PWA_INSTALL_ENGAGEMENT_DELAY_MS = 30_000

export type PwaInstallStorageRecord = {
  version: typeof PWA_INSTALL_STORAGE_VERSION
  dismissedAt: number | null
  installedAt: number | null
  lastPromptAt: number | null
  promptCount: number
  visitCount: number
}

const defaultRecord = (): PwaInstallStorageRecord => ({
  version: PWA_INSTALL_STORAGE_VERSION,
  dismissedAt: null,
  installedAt: null,
  lastPromptAt: null,
  promptCount: 0,
  visitCount: 0,
})

function readRecord(): PwaInstallStorageRecord {
  try {
    const raw = localStorage.getItem(PWA_INSTALL_STORAGE_KEY)
    if (!raw) {
      return defaultRecord()
    }

    const parsed = JSON.parse(raw) as Partial<PwaInstallStorageRecord>
    if (parsed.version !== PWA_INSTALL_STORAGE_VERSION) {
      return defaultRecord()
    }

    return {
      ...defaultRecord(),
      ...parsed,
      version: PWA_INSTALL_STORAGE_VERSION,
    }
  } catch {
    return defaultRecord()
  }
}

function writeRecord(record: PwaInstallStorageRecord): void {
  localStorage.setItem(PWA_INSTALL_STORAGE_KEY, JSON.stringify(record))
}

export function recordPwaVisit(): PwaInstallStorageRecord {
  const record = readRecord()
  record.visitCount += 1
  writeRecord(record)
  return record
}

export function markPwaInstallDismissed(now = Date.now()): PwaInstallStorageRecord {
  const record = readRecord()
  record.dismissedAt = now
  record.lastPromptAt = now
  writeRecord(record)
  return record
}

export function markPwaInstalled(now = Date.now()): PwaInstallStorageRecord {
  const record = readRecord()
  record.installedAt = now
  writeRecord(record)
  return record
}

export function clearStaleInstalledHint(): PwaInstallStorageRecord {
  const record = readRecord()
  if (!record.installedAt) {
    return record
  }

  record.installedAt = null
  record.dismissedAt = null
  writeRecord(record)
  return record
}

export function markPwaPromptShown(now = Date.now()): PwaInstallStorageRecord {
  const record = readRecord()
  record.lastPromptAt = now
  record.promptCount += 1
  writeRecord(record)
  return record
}

export function isPwaInstallCooldownActive(
  record: PwaInstallStorageRecord,
  now = Date.now(),
): boolean {
  if (!record.dismissedAt) {
    return false
  }

  return now - record.dismissedAt < PWA_INSTALL_COOLDOWN_MS
}

export function hasPwaInstallEngagement(record: PwaInstallStorageRecord): boolean {
  return record.visitCount >= PWA_INSTALL_MIN_VISITS
}

export function readPwaInstallRecord(): PwaInstallStorageRecord {
  return readRecord()
}

export function resetPwaInstallRecordForTests(): void {
  localStorage.removeItem(PWA_INSTALL_STORAGE_KEY)
}
