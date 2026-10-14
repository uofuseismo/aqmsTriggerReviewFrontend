import type { SubnetTrigger } from './types'

function sameTrigger(a: SubnetTrigger, b: SubnetTrigger): boolean {
  return a.id === b.id && a.timeMs === b.timeMs && a.originSource === b.originSource
}

/**
 * Folds a freshly fetched list into the one on screen, keeping the identity
 * of every trigger that has not changed.
 *
 * The route carries no hash, so this is what keeps a quiet poll quiet: rows
 * are memoised on the trigger object, and when nothing moved at all the
 * previous array itself comes back and React sees no change.
 */
export function mergeTriggers(
  previous: SubnetTrigger[],
  incoming: SubnetTrigger[],
): SubnetTrigger[] {
  if (previous.length === 0) return incoming

  const byId = new Map(previous.map((trigger) => [trigger.id, trigger]))
  let changed = incoming.length !== previous.length

  const merged = incoming.map((trigger, index) => {
    const existing = byId.get(trigger.id)
    if (existing !== undefined && sameTrigger(existing, trigger)) {
      if (previous[index] !== existing) changed = true
      return existing
    }
    changed = true
    return trigger
  })

  return changed ? merged : previous
}
