/**
 * One row of GET /subnet-triggers, as the backend sends it.
 *
 * A subnet trigger is an event that has not been located: there is no
 * latitude, longitude, depth, magnitude or region to report, only when it
 * fired and what declared it.
 */
export interface RawSubnetTrigger {
  eventIdentifier: number
  /**
   * Nanoseconds since the epoch. Larger than Number.MAX_SAFE_INTEGER, so
   * JSON.parse rounds it to the nearest 256 ns - irrelevant at the
   * millisecond resolution it is displayed at.
   */
  time: number
  /** The system that declared the trigger, e.g. "RTT". */
  originSource: string
}

export interface SubnetTrigger {
  id: number
  time: Date
  /** `time` as epoch milliseconds, for sorting and comparison. */
  timeMs: number
  originSource: string
}
