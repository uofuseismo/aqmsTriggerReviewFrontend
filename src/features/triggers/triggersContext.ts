import { createContext } from 'react'
import type { Sort } from './sortTriggers'
import type { SubnetTrigger } from './types'

export interface TriggersContextValue {
  /** The list, less any trigger with a decision on its way to the backend. */
  triggers: SubnetTrigger[]
  /**
   * `triggers` in the analyst's chosen sort - the order the table shows and
   * the order a review walks, so "next" always means the next row down.
   */
  ordered: SubnetTrigger[]
  sort: Sort
  /** Stable identity. */
  setSort: (sort: Sort) => void
  loading: boolean
  error: string | null
  /** When the held list was last confirmed fresh. */
  fetchedAt: Date | null
  /** Re-read with a spinner. Stable identity. */
  reload: () => void
  /** Re-read quietly, keeping what is on screen until the answer arrives. */
  revalidate: () => void
  /**
   * Takes a trigger out of the list - or puts it back - ahead of the
   * backend agreeing. A decided trigger should vanish the moment it is
   * decided, not two minutes later at the next poll. Stable identity.
   */
  setHidden: (triggerId: number, hidden: boolean) => void
}

export const TriggersContext = createContext<TriggersContextValue | null>(null)
