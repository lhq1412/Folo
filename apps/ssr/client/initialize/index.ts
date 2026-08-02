import { initI18n } from "@client/i18n"
import { initializeDayjs } from "@follow/components/dayjs"

export const initialize = async () => {
  initializeDayjs()
  await initI18n()
}
