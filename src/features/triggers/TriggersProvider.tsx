import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, apiGet } from '../../api/client'
import { TRIGGERS_POLL_SECONDS } from '../../api/config'
import { useAuth } from '../../auth/useAuth'
import { mergeTriggers } from './mergeTriggers'
import { parseTriggers } from './parseTriggers'
import { parseSort, sortTriggers, type Sort } from './sortTriggers'
import { TriggersContext, type TriggersContextValue } from './triggersContext'
import type { RawSubnetTrigger, SubnetTrigger } from './types'

const SORT_STORAGE_KEY = 'trigger-review:sort'

interface TriggersState {
  triggers: SubnetTrigger[]
  loading: boolean
  error: string | null
  fetchedAt: Date | null
}

/**
 * Holds the subnet-trigger list for the whole signed-in app.
 *
 * Above the router, so the review page can find the next trigger without a
 * fetch of its own and coming back to the list keeps its sort and filter.
 * The route returns every trigger in one response with no paging; at ~120
 * rows of three fields each it is a few KB.
 */
export function TriggersProvider({ children }: { children: ReactNode }) {
  const { getToken, expireSession } = useAuth()
  const [state, setState] = useState<TriggersState>({
    triggers: [],
    loading: true,
    error: null,
    fetchedAt: null,
  })

  const inFlight = useRef<AbortController | null>(null)

  const load = useCallback(
    async (background = false) => {
      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      if (!background) setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const rows = await apiGet<RawSubnetTrigger[]>(
          '/subnet-triggers',
          getToken(),
          controller.signal,
        )
        if (controller.signal.aborted) return
        if (!Array.isArray(rows)) {
          throw new ApiError(200, 'The server returned the trigger list in an unexpected shape.')
        }
        setState((prev) => ({
          triggers: mergeTriggers(prev.triggers, parseTriggers(rows)),
          loading: false,
          error: null,
          fetchedAt: new Date(),
        }))
      } catch (cause) {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (cause instanceof ApiError && cause.isUnauthorized) {
          expireSession()
          return
        }
        const message =
          cause instanceof ApiError ? cause.message : 'Could not load the subnet triggers.'
        setState((prev) => ({
          ...prev,
          loading: false,
          // A failed background poll leaves a good list alone; a load somebody
          // asked for - first visit, or Refresh - says it failed.
          error: background && prev.triggers.length > 0 ? prev.error : message,
        }))
      }
    },
    [getToken, expireSession],
  )

  useEffect(() => {
    // Deferred a tick so the first render paints before the fetch begins.
    const start = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(start)
      inFlight.current?.abort()
    }
  }, [load])

  // Polling, paused while the tab is hidden.
  useEffect(() => {
    if (TRIGGERS_POLL_SECONDS === 0) return

    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      if (document.hidden) return
      timer = window.setTimeout(() => {
        void load(true)
        schedule()
      }, TRIGGERS_POLL_SECONDS * 1000)
    }
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
        return
      }
      // Back in view: confirm once now rather than waiting out an interval.
      void load(true)
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  const reload = useCallback(() => void load(false), [load])
  const revalidate = useCallback(() => void load(true), [load])

  const [hidden, setHiddenIds] = useState<ReadonlySet<number>>(() => new Set())
  const setHidden = useCallback((triggerId: number, hide: boolean) => {
    setHiddenIds((previous) => {
      if (previous.has(triggerId) === hide) return previous
      const next = new Set(previous)
      if (hide) next.add(triggerId)
      else next.delete(triggerId)
      return next
    })
  }, [])

  // The fetched array itself when nothing is hidden, so the table's memo
  // still holds across polls.
  const visible = useMemo(
    () =>
      hidden.size === 0
        ? state.triggers
        : state.triggers.filter((trigger) => !hidden.has(trigger.id)),
    [state.triggers, hidden],
  )

  /*
    The sort lives here rather than in the table, because it is also the
    review order: the review page walks `ordered`, so re-sorting the list
    changes which trigger comes next. Remembered per browser; storage can
    refuse, and then it is simply the default each visit.
  */
  const [sort, setSortState] = useState<Sort>(() => {
    try {
      return parseSort(window.localStorage.getItem(SORT_STORAGE_KEY))
    } catch {
      return parseSort(null)
    }
  })
  const setSort = useCallback((next: Sort) => {
    setSortState(next)
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }, [])
  const ordered = useMemo(() => sortTriggers(visible, sort), [visible, sort])

  const value = useMemo<TriggersContextValue>(
    () => ({ ...state, triggers: visible, ordered, sort, setSort, reload, revalidate, setHidden }),
    [state, visible, ordered, sort, setSort, reload, revalidate, setHidden],
  )

  return <TriggersContext.Provider value={value}>{children}</TriggersContext.Provider>
}
