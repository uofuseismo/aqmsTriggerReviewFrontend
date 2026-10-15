import { decodeAndFilterSegment } from './waveformFilter.js'

const NS_PER_MS = 1_000_000

/**
 * A segment exactly as the backend sends it, with
 * `?filter=false&enableDeltaEncoding=true`.
 *
 * `data` is integer counts, delta encoded: the first value is absolute and
 * each one after is a difference. `startTime` is nanoseconds since the epoch.
 */
export interface RawWaveformSegment {
  startTime: number
  samplingRate: number
  data: number[]
  gain?: number
  deltaEncoded?: boolean
}

export interface RawWaveformChannel {
  network: string
  station: string
  channel: string
  locationCode: string
  segments: RawWaveformSegment[]
}

/**
 * What `apiGet` hands back for the waveform route: the array itself, not the
 * `{message, data}` envelope, which apiGet unwraps for every call.
 */
export type RawWaveforms = RawWaveformChannel[]

export interface WaveformSegment {
  /** Epoch milliseconds of the first sample. */
  startMs: number
  /** Epoch milliseconds of the last sample. */
  endMs: number
  samplingRate: number
  /** Sample interval in milliseconds. */
  dtMs: number
  /** Decoded, detrended, bandpassed. */
  samples: Float64Array
  /**
   * False when no filter design matched this sampling rate, in which case
   * the samples are decoded but raw. Say so rather than implying otherwise.
   */
  filtered: boolean
  /** Largest absolute sample, for normalising the trace into its lane. */
  peak: number
  /** When `peak` occurs, epoch milliseconds. */
  peakMs: number
}

export interface WaveformChannel {
  /** "UU.FORK.EHZ.01". */
  streamId: string
  network: string
  station: string
  channel: string
  locationCode: string
  segments: WaveformSegment[]
  /** Largest absolute sample across every segment on this channel. */
  peak: number
  /** When the channel's largest sample occurs, epoch milliseconds. */
  peakMs: number
  startMs: number
  endMs: number
  /** True when at least one segment could not be filtered. */
  partiallyUnfiltered: boolean
}

/**
 * Nanoseconds to milliseconds. JSON.parse has already quantised the epoch to
 * about 256 ns - 1.79e18 is past what a double holds exactly - which is
 * irrelevant at millisecond resolution.
 */
function nsToMs(ns: number): number {
  return ns / NS_PER_MS
}

/**
 * Reconstitutes one segment: delta decode, gain, detrend, bandpass.
 *
 * All of that lives in waveformFilter.js, a verified port of the backend's
 * C++ shared with aqmsDutyReviewFrontend; it is JSDoc-typed JavaScript so it
 * can be re-ported without a TypeScript rewrite.
 */
function parseSegment(raw: RawWaveformSegment): WaveformSegment {
  const decoded = decodeAndFilterSegment({
    ...raw,
    gain: raw.gain ?? 1,
    deltaEncoded: raw.deltaEncoded ?? false,
  }) as {
    data: Float64Array
    samplingRate: number
    filtered: boolean
  }
  const samples = decoded.data
  let peak = 0
  let peakIndex = 0
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i])
    if (magnitude > peak) {
      peak = magnitude
      peakIndex = i
    }
  }
  const dtMs = 1000 / raw.samplingRate
  const startMs = nsToMs(raw.startTime)
  return {
    startMs,
    // The last SAMPLE, not the end of the window: n samples span n-1 intervals.
    endMs: startMs + (samples.length - 1) * dtMs,
    samplingRate: raw.samplingRate,
    dtMs,
    samples,
    filtered: decoded.filtered,
    peak,
    peakMs: startMs + peakIndex * dtMs,
  }
}

/**
 * Turns the payload into channels with real samples on a real time base.
 *
 * Channels with no usable samples are dropped rather than carried as empty
 * lanes - a labelled blank row invites the reader to conclude the station was
 * quiet, when in fact nothing was sent.
 */
export function parseWaveforms(payload: RawWaveforms | null | undefined): WaveformChannel[] {
  const channels: WaveformChannel[] = []
  for (const raw of payload ?? []) {
    const segments = (raw.segments ?? [])
      .filter((segment) => Array.isArray(segment.data) && segment.data.length > 0)
      .map(parseSegment)
      .sort((a, b) => a.startMs - b.startMs)
    if (segments.length === 0) continue
    const loudest = segments.reduce((best, segment) => (segment.peak > best.peak ? segment : best))
    channels.push({
      streamId: [raw.network, raw.station, raw.channel, raw.locationCode]
        .filter((part) => part !== undefined && part !== '')
        .join('.'),
      network: raw.network,
      station: raw.station,
      channel: raw.channel,
      locationCode: raw.locationCode,
      segments,
      peak: loudest.peak,
      peakMs: loudest.peakMs,
      startMs: Math.min(...segments.map((segment) => segment.startMs)),
      endMs: Math.max(...segments.map((segment) => segment.endMs)),
      partiallyUnfiltered: segments.some((segment) => !segment.filtered),
    })
  }
  return channels
}

/** One trace's place in the record section. */
export interface Trace {
  channel: WaveformChannel
  /** Lane index, 0 at the top. */
  lane: number
}

/**
 * How the lanes are ordered.
 *
 * A trigger has no location, so there is no distance to sort by - the order
 * a record section normally takes. Two stand-ins:
 *
 * - `peakTime` (the default): by when each trace reaches its largest
 *   amplitude. For a local event the nearest stations peak first, so the
 *   moveout reads as a diagonal down the section; a teleseism peaks nearly
 *   everywhere at once; noise has no pattern at all. A glitch can claim a
 *   trace's peak, so this is a way of looking, not a measurement.
 * - `station`: alphabetical. Predictable; a station is always in the same
 *   place from one trigger to the next.
 */
export type TraceOrder = 'station' | 'peakTime'

export function buildRecordSection(channels: WaveformChannel[], order: TraceOrder): Trace[] {
  const byStation = (a: WaveformChannel, b: WaveformChannel) =>
    a.station.localeCompare(b.station) ||
    a.network.localeCompare(b.network) ||
    a.streamId.localeCompare(b.streamId)
  const sorted = [...channels].sort(
    order === 'peakTime' ? (a, b) => a.peakMs - b.peakMs || byStation(a, b) : byStation,
  )
  return sorted.map((channel, lane) => ({ channel, lane }))
}

/**
 * How tall one trace is drawn, as a fraction of its lane.
 *
 * Below 0.5 so that two neighbours at full deflection cannot overlap and be
 * mistaken for one another's signal.
 */
export const TRACE_HALF_HEIGHT = 0.45

/**
 * The y centre of a lane.
 *
 * Negative going down, so lane 0 sits at the top with a plain (unreversed)
 * axis and a positive sample still deflects UP.
 */
export function laneY(lane: number): number {
  return -lane
}

/**
 * A segment as plottable points, normalised into its lane.
 *
 * Each trace is scaled by its OWN peak: amplitudes across a section span
 * orders of magnitude, and a shared scale would flatten every quiet trace
 * into a line. The cost is that a trace of pure noise fills its lane just as
 * a trace with an arrival does.
 *
 * `{x, y}` objects with `parsing: false` is what Chart.js decimation
 * requires; it will not decimate any other shape.
 */
export function segmentPoints(
  segment: WaveformSegment,
  lane: number,
  peak: number,
): { x: number; y: number }[] {
  const scale = peak > 0 ? TRACE_HALF_HEIGHT / peak : 0
  const centre = laneY(lane)
  const points = new Array<{ x: number; y: number }>(segment.samples.length)
  for (let i = 0; i < segment.samples.length; i++) {
    points[i] = { x: segment.startMs + i * segment.dtMs, y: centre + segment.samples[i] * scale }
  }
  return points
}

/** The time span covering every trace, for the initial axis range. */
export function recordSectionExtent(traces: Trace[]): { minMs: number; maxMs: number } | null {
  if (traces.length === 0) return null
  let minMs = Infinity
  let maxMs = -Infinity
  for (const trace of traces) {
    if (trace.channel.startMs < minMs) minMs = trace.channel.startMs
    if (trace.channel.endMs > maxMs) maxMs = trace.channel.endMs
  }
  return { minMs, maxMs }
}
