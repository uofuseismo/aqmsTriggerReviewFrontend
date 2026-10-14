import type { SubnetTrigger } from './types'

export type SortKey = 'id' | 'time' | 'originSource'
export type SortDirection = 'asc' | 'desc'

export interface Sort {
  key: SortKey
  direction: SortDirection
}

/**
 * Oldest first. The list's order is also the order a review walks, and a
 * backlog is worked from its oldest end so nothing ages out of the window
 * unreviewed. Analysts can re-sort; see TriggersProvider.
 */
export const DEFAULT_SORT: Sort = { key: 'time', direction: 'asc' }

/** Sorts a copy, leaving the fetched array untouched. */
export function sortTriggers(triggers: SubnetTrigger[], sort: Sort): SubnetTrigger[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...triggers].sort((a, b) => {
    let comparison: number
    switch (sort.key) {
      case 'id':
        comparison = a.id - b.id
        break
      case 'time':
        comparison = a.timeMs - b.timeMs
        break
      case 'originSource':
        comparison = a.originSource.localeCompare(b.originSource)
        break
    }
    // Ties fall back to newest first so the order is total and stable.
    return comparison !== 0 ? comparison * factor : b.timeMs - a.timeMs
  })
}

const SORT_KEYS: readonly SortKey[] = ['id', 'time', 'originSource']

/** A stored sort, or the default if what was stored is missing or malformed. */
export function parseSort(raw: string | null): Sort {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<Sort> | null
    if (
      value !== null &&
      SORT_KEYS.includes(value.key as SortKey) &&
      (value.direction === 'asc' || value.direction === 'desc')
    ) {
      return { key: value.key as SortKey, direction: value.direction }
    }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_SORT
}
