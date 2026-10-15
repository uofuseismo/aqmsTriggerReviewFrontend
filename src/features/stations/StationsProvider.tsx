import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { StationsContext, type StationsContextValue } from './stationsContext'
import { fetchStations, indexStationLocations } from './stations'

/**
 * Station locations, fetched once right after sign-in and held for the
 * session.
 *
 * They change on the scale of months, so there is no polling; a new session
 * picks up any change. Loaded up front rather than on the first review, so
 * ordering by distance is ready the moment an analyst asks for it.
 *
 * A failure is not fatal: only distance ordering needs these, and the rest of
 * the review works without them.
 */
export function StationsProvider({ children }: { children: ReactNode }) {
  const { status, getToken, expireSession } = useAuth()
  const [state, setState] = useState<StationsContextValue>({
    locations: new Map(),
    loading: true,
    error: null,
  })

  /*
    Keyed on the session status, so a fetch the server refused as expired is
    tried again once the analyst has signed back in, instead of leaving the
    locations missing for the rest of the session.
  */
  const loaded = state.locations.size > 0
  useEffect(() => {
    if (status !== 'active' || loaded) return
    const controller = new AbortController()
    // Deferred a tick so the first render paints before the fetch begins.
    const start = window.setTimeout(() => {
      fetchStations(getToken(), controller.signal).then(
        (rows) => {
          if (controller.signal.aborted) return
          setState({
            locations: indexStationLocations(Array.isArray(rows) ? rows : []),
            loading: false,
            error: null,
          })
        },
        (cause) => {
          if (controller.signal.aborted) return
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          if (cause instanceof ApiError && cause.isUnauthorized) {
            // Ends the session; the effect runs again on signing back in.
            expireSession()
            return
          }
          setState({
            locations: new Map(),
            loading: false,
            error: cause instanceof Error ? cause.message : 'Could not load station locations.',
          })
        },
      )
    }, 0)
    return () => {
      window.clearTimeout(start)
      controller.abort()
    }
  }, [status, loaded, getToken, expireSession])

  const value = useMemo(() => state, [state])
  return <StationsContext.Provider value={value}>{children}</StationsContext.Provider>
}
