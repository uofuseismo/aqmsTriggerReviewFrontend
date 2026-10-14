import type { RawSubnetTrigger, SubnetTrigger } from './types'

/** Nanoseconds per millisecond. */
const NS_PER_MS = 1_000_000

export function parseTrigger(raw: RawSubnetTrigger): SubnetTrigger {
  const timeMs = raw.time / NS_PER_MS
  return {
    id: raw.eventIdentifier,
    time: new Date(timeMs),
    timeMs,
    // Always present in practice; a blank is still better than "undefined".
    originSource: typeof raw.originSource === 'string' ? raw.originSource : '',
  }
}

export function parseTriggers(rows: RawSubnetTrigger[]): SubnetTrigger[] {
  return rows.map(parseTrigger)
}
