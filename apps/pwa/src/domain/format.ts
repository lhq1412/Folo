export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value))
