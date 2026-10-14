import type { SubnetTrigger } from './types'

/** Escapes a string so it matches itself when used as a pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Filters by identifier, the same way the duty-review search box does.
 *
 * The query is an unanchored regular expression against the id, so "311"
 * means "contains 311" and `^`/`$` anchor it. A query that is not valid
 * regex - easy to type halfway through "31(" - is matched literally rather
 * than throwing or blanking the list.
 */
export function filterTriggers(triggers: SubnetTrigger[], query: string): SubnetTrigger[] {
  const trimmed = query.trim()
  if (trimmed === '') return triggers

  let pattern: RegExp
  try {
    pattern = new RegExp(trimmed, 'i')
  } catch {
    pattern = new RegExp(escapeRegExp(trimmed), 'i')
  }
  return triggers.filter((trigger) => pattern.test(String(trigger.id)))
}
