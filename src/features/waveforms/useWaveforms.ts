import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { parseWaveforms, type RawWaveforms, type WaveformChannel } from './waveforms'

/**
 * A trigger's vertical channels are ~1.2 MB of JSON and decode to ~3.5 MB of
 * samples, so the payload gets far longer than the usual request timeout to
 * arrive on a slow link.
 */
const WAVEFORM_TIMEOUT_MS = 60_000

/**
 * How many triggers' waveforms to hold.
 *
 * The current trigger, the ones prefetched ahead of it (PREFETCH_AHEAD on
 * the review page), and a few behind - so an Undo, which jumps back to a
 * trigger decided seconds ago, does not download it again. At ~3.5 MB
 * decoded apiece that is about 20 MB; not so many that an afternoon of
 * review holds hundreds.
 */
const CACHE_SIZE = 6

/**
 * Settled results, oldest first. A Map iterates in insertion order, so
 * re-inserting on use makes it a small LRU.
 */
const cache = new Map<number, WaveformChannel[]>()
/** Requests in flight, shared so a prefetch and the page never double-fetch. */
const pending = new Map<number, Promise<WaveformChannel[]>>()

function remember(triggerId: number, channels: WaveformChannel[]) {
  cache.delete(triggerId)
  cache.set(triggerId, channels)
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function cached(triggerId: number): WaveformChannel[] | undefined {
  const channels = cache.get(triggerId)
  if (channels !== undefined) remember(triggerId, channels)
  return channels
}

export function waveformsPath(triggerId: number): string {
  return `/subnet-triggers/${triggerId}/waveforms?filter=false&enableDeltaEncoding=true&verticalOnly=true`
}

/**
 * Fetches and decodes one trigger's waveforms, sharing any request already
 * under way.
 *
 * Deliberately not abortable by the caller: the page and the prefetcher may
 * both be waiting on the same promise, and leaving a trigger should not
 * throw away a download the next visit would want.
 *
 * `filter=false&enableDeltaEncoding=true` is the cheaper contract - integer
 * counts delta-encode and compress far better than the fractional doubles a
 * server-side filter produces - and the bandpass runs here instead.
 */
function loadWaveforms(triggerId: number, token: string | null): Promise<WaveformChannel[]> {
  const hit = cached(triggerId)
  if (hit !== undefined) return Promise.resolve(hit)
  const inFlight = pending.get(triggerId)
  if (inFlight !== undefined) return inFlight

  const request = apiGet<RawWaveforms>(
    waveformsPath(triggerId),
    token,
    AbortSignal.timeout(WAVEFORM_TIMEOUT_MS),
  )
    .then((raw) => {
      const channels = parseWaveforms(raw)
      remember(triggerId, channels)
      return channels
    })
    .finally(() => pending.delete(triggerId))
  pending.set(triggerId, request)
  return request
}

/**
 * Loads the triggers the analyst will reach next, behind the current one.
 *
 * Waits for the current trigger's own waveforms first - shared with the
 * page's request, not a second download - so a prefetch never competes with
 * what the analyst is looking at. Then one at a time, in order, so the
 * immediate next trigger is always the first one ready.
 *
 * Failures are dropped: the page asks again, and reports, on arrival.
 *
 * @returns A cancel function. It stops further prefetches from starting; one
 *          already under way is left to finish, since the next visit to that
 *          trigger would only ask for it again.
 */
export function prefetchAhead(
  currentId: number,
  aheadIds: readonly number[],
  token: string | null,
): () => void {
  let cancelled = false
  if (token === null) return () => {}
  void (async () => {
    await loadWaveforms(currentId, token).catch(() => {})
    for (const triggerId of aheadIds) {
      if (cancelled) return
      await loadWaveforms(triggerId, token).catch(() => {})
    }
  })()
  return () => {
    cancelled = true
  }
}

interface WaveformState {
  /** Which trigger this state describes, so a stale one is recognisable. */
  triggerId: number | undefined
  channels: WaveformChannel[]
  loading: boolean
  error: string | null
}

function initialState(triggerId: number | undefined): WaveformState {
  const hit = triggerId === undefined ? undefined : cache.get(triggerId)
  return {
    triggerId,
    channels: hit ?? [],
    loading: triggerId !== undefined && hit === undefined,
    error: null,
  }
}

export function useWaveforms(triggerId: number | undefined) {
  const { getToken, expireSession } = useAuth()
  const [state, setState] = useState<WaveformState>(() => initialState(triggerId))
  /** Bumped by `reload` to re-run the load effect after a failure. */
  const [attempt, setAttempt] = useState(0)

  /*
    Switching triggers is resolved during render, not in an effect, so the
    previous trigger's traces are never on screen for a frame under the new
    trigger's heading.
  */
  const current = state.triggerId === triggerId ? state : initialState(triggerId)

  useEffect(() => {
    if (triggerId === undefined) return
    let live = true
    // Deferred a tick so the loading flag is not set inside the effect body.
    const start = window.setTimeout(() => {
      if (!cache.has(triggerId)) {
        setState({ triggerId, channels: [], loading: true, error: null })
      }
      loadWaveforms(triggerId, getToken()).then(
        (channels) => {
          if (live) setState({ triggerId, channels, loading: false, error: null })
        },
        (cause) => {
          if (!live) return
          if (cause instanceof ApiError && cause.isUnauthorized) {
            expireSession()
            return
          }
          setState({
            triggerId,
            channels: [],
            loading: false,
            error: cause instanceof Error ? cause.message : 'Could not load the waveforms.',
          })
        },
      )
    }, 0)
    return () => {
      live = false
      window.clearTimeout(start)
    }
  }, [triggerId, attempt, getToken, expireSession])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...current, reload }
}
