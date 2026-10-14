import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, apiPost } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { toaster } from '../../components/ui/toasterStore'
import { DecisionQueueContext, type DecisionQueueValue } from './decisionQueueContext'
import { decisionCall, decisionName, type Decision } from './decisions'
import { triggerPath } from './paths'
import { useTriggers } from './useTriggers'

/**
 * How long a decision waits before it is sent, in milliseconds.
 *
 * Long enough to see a mis-pressed key in the toast and reach Undo; short
 * enough that the decision is in AQMS before the analyst has finished the
 * next trigger.
 */
export const UNDO_WINDOW_MS = 5_000

interface Queued {
  decision: Decision
  timer: number
  /**
   * The token at the time of the decision. Only for the flush on the way
   * out, when the session may already be gone from memory - signing out
   * clears it before this provider unmounts.
   */
  token: string | null
}

const toastId = (triggerId: number) => `decision-${triggerId}`

/** The backend's messages carry no closing full stop; one is added before more text follows. */
function sentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`
}

/**
 * Holds decisions through their undo window, then records them.
 *
 * Above the routes, because a decision outlives the page it was made on:
 * the page moves straight on to the next trigger, and the decision counts
 * down - and can still be undone - from there.
 *
 * The trigger is hidden from the list the moment it is decided, and only
 * put back if the decision is undone or the backend refuses it.
 */
export function DecisionQueueProvider({ children }: { children: ReactNode }) {
  const { getToken, expireSession } = useAuth()
  const { setHidden, revalidate } = useTriggers()
  const navigate = useNavigate()
  const queue = useRef(new Map<number, Queued>())

  const send = useCallback(
    async (triggerId: number, decision: Decision, token: string | null) => {
      const { path, body } = decisionCall(triggerId, decision)
      const name = decisionName(decision)
      try {
        await apiPost(path, body, token)
        // Confirm against the backend; the trigger is already hidden, so
        // nothing on screen moves.
        revalidate()
      } catch (cause) {
        const status = cause instanceof ApiError ? cause.status : 0
        const message = cause instanceof Error ? cause.message : 'The decision was not recorded.'
        if (status === 409 || status === 404) {
          // Somebody else got there first, or it is gone. Either way it is
          // not a trigger to review any more, so it stays out of the list.
          toaster.create({
            type: 'info',
            title: `Trigger ${triggerId} was not changed`,
            description: message,
            duration: 8_000,
            closable: true,
          })
          revalidate()
          return
        }
        setHidden(triggerId, false)
        if (cause instanceof ApiError && cause.isUnauthorized) expireSession()
        // Kept on screen until dismissed: a decision that did not land is
        // work the analyst believes is done.
        toaster.create({
          type: 'error',
          title: `Trigger ${triggerId} was not recorded as ${name}`,
          description: `${sentence(message)} It is back in the list.`,
          duration: Number.POSITIVE_INFINITY,
          closable: true,
          action: { label: 'Open it', onClick: () => navigate(triggerPath(triggerId)) },
        })
      }
    },
    [revalidate, setHidden, expireSession, navigate],
  )

  const undo = useCallback(
    (triggerId: number) => {
      const queued = queue.current.get(triggerId)
      // Already sent: too late, and the toast is on its way out anyway.
      if (queued === undefined) return
      window.clearTimeout(queued.timer)
      queue.current.delete(triggerId)
      setHidden(triggerId, false)
      toaster.dismiss(toastId(triggerId))
      navigate(triggerPath(triggerId))
    },
    [setHidden, navigate],
  )

  const submit = useCallback(
    (triggerId: number, decision: Decision) => {
      if (queue.current.has(triggerId)) return false
      const token = getToken()
      const timer = window.setTimeout(() => {
        queue.current.delete(triggerId)
        void send(triggerId, decision, getToken() ?? token)
      }, UNDO_WINDOW_MS)
      queue.current.set(triggerId, { decision, timer, token })
      setHidden(triggerId, true)
      toaster.create({
        id: toastId(triggerId),
        type: 'info',
        title: `Trigger ${triggerId}: ${decisionName(decision)}`,
        description: 'Recording in a few seconds.',
        duration: UNDO_WINDOW_MS,
        action: { label: 'Undo', onClick: () => undo(triggerId) },
      })
      return true
    },
    [getToken, send, setHidden, undo],
  )

  /*
    Nothing queued is lost by leaving. Closing the tab, reloading, or
    signing out sends every waiting decision at once - keepalive, so the
    request survives the page - rather than dropping decisions the analyst
    saw confirmed in a toast.
  */
  useEffect(() => {
    const pending = queue.current
    const flush = () => {
      for (const [triggerId, queued] of pending) {
        window.clearTimeout(queued.timer)
        const { path, body } = decisionCall(triggerId, queued.decision)
        void apiPost(path, body, getToken() ?? queued.token, undefined, {
          keepalive: true,
        }).catch(() => {})
      }
      pending.clear()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [getToken])

  const value = useMemo<DecisionQueueValue>(() => ({ submit }), [submit])
  return <DecisionQueueContext.Provider value={value}>{children}</DecisionQueueContext.Provider>
}
