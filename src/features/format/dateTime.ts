const localDateTime = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Full local date and time, e.g. "2026-09-02 14:53:53". */
export function formatLocalDateTime(date: Date): string {
  return localDateTime.format(date).replace(',', '')
}

/**
 * The reader's current time-zone abbreviation, e.g. "MDT".
 *
 * Shown once in a column header rather than repeated on every row, and read
 * from the machine so the daylight-saving switch needs no maintenance.
 */
export function localZoneAbbreviation(): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(
    new Date(),
  )
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'local'
}

/**
 * UTC, always, and said so in the column header.
 *
 * Trigger times get compared against other networks' records; rendering them
 * in whatever zone the analyst's laptop is set to would be a genuine source
 * of error, not a convenience.
 */
const utcParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** e.g. "2026-10-13 14:51:42". */
export function formatUtc(date: Date): string {
  const p = Object.fromEntries(utcParts.formatToParts(date).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

/**
 * Wall-clock time in the reader's own zone, with the zone named.
 *
 * Deliberately not UTC: "updated at" is a freshness signal read against the
 * clock on the wall, not data.
 */
const localTimeParts = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
})

export function formatLocalTimeOnly(date: Date): string {
  return localTimeParts.format(date)
}
