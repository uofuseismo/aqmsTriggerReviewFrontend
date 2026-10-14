/**
 * What an analyst can decide about a subnet trigger.
 *
 * Rejections say the trigger is not a local earthquake and name what it is
 * instead; acceptances keep it. Every decision takes the trigger out of the
 * subnet-trigger list.
 */
export type Decision = 'delete' | 'regional' | 'teleseism' | 'sonic' | 'accept' | 'local'

export type DecisionSide = 'reject' | 'accept'

/**
 * Which backend route records a decision.
 *
 * - `accept` leaves the event a subnet trigger and bumps its version past 0,
 *   which is what takes it off the list.
 * - `delete` removes it from the catalog - AQMS sets its selectflag to 0,
 *   so it is hidden rather than erased.
 * - `preset` is one of the backend's fast-track retypes, which fix the event
 *   and geographic type server side and take no body:
 *     sonic     -> (sonic, local)
 *     regional  -> (earthquake, regional)
 *     teleseism -> (earthquake, teleseismic)
 * - `retype` names both types itself, in the backend's serialised spellings
 *   (serialize.cpp), not AQMS's codes. Only Local uses it - there is no
 *   preset for a local earthquake.
 */
export type DecisionRequest =
  | { route: 'accept' }
  | { route: 'delete' }
  | { route: 'preset'; preset: 'sonic' | 'regional' | 'teleseism' }
  | {
      route: 'retype'
      eventType: 'earthquake'
      geographicType: 'local'
    }

export interface DecisionOption {
  value: Decision
  label: string
  /**
   * What the decision means, in a sentence. Shown as the button's tooltip,
   * and under the item in the phone's menu, where there is no hover.
   */
  description: string
  request: DecisionRequest
  /** Lower-case key that makes this decision on the review page. */
  key: string
}

/**
 * Left to right as drawn: rejections on the left, acceptances on the right,
 * the swipe intuition - left is no, right is yes.
 */
export const REJECTIONS: DecisionOption[] = [
  /*
    Far left, the furthest from Accept: the strongest "no" sits at the far
    end of the swipe.
  */
  {
    value: 'delete',
    label: 'Delete',
    description: 'Not an event at all - noise or a false trigger. It is removed from the catalog.',
    request: { route: 'delete' },
    key: 'd',
  },
  {
    value: 'regional',
    label: 'Regional',
    description: 'A real earthquake, but outside the network - not a local event.',
    request: { route: 'preset', preset: 'regional' },
    key: 'r',
  },
  {
    value: 'teleseism',
    label: 'Teleseism',
    description: 'A distant earthquake: energy reaches the whole network at nearly the same time.',
    request: { route: 'preset', preset: 'teleseism' },
    key: 't',
  },
  {
    value: 'sonic',
    label: 'Sonic',
    description:
      'An acoustic source, such as a sonic boom or a blast in the air - not an earthquake.',
    request: { route: 'preset', preset: 'sonic' },
    key: 's',
  },
]

export const ACCEPTANCES: DecisionOption[] = [
  {
    value: 'accept',
    label: 'As is',
    description: "Keep the trigger as it is. The event's version is bumped so it leaves the list.",
    request: { route: 'accept' },
    key: 'a',
  },
  {
    value: 'local',
    label: 'Local',
    description: 'A local earthquake inside the network.',
    request: { route: 'retype', eventType: 'earthquake', geographicType: 'local' },
    key: 'l',
  },
]

export const DECISIONS: DecisionOption[] = [...REJECTIONS, ...ACCEPTANCES]

export function sideOf(decision: Decision): DecisionSide {
  return REJECTIONS.some((option) => option.value === decision) ? 'reject' : 'accept'
}

export function decisionOption(decision: Decision): DecisionOption {
  const option = DECISIONS.find((candidate) => candidate.value === decision)
  if (option === undefined) throw new Error(`No such decision: ${decision}`)
  return option
}

/** "Reject: Teleseism" - how a decision is named back to the analyst. */
export function decisionName(decision: Decision): string {
  return `${sideOf(decision) === 'reject' ? 'Reject' : 'Accept'}: ${decisionOption(decision).label}`
}

/** The route and body that record a decision about one trigger. */
export function decisionCall(
  triggerId: number,
  decision: Decision,
): { path: string; body: Record<string, unknown> } {
  const request = decisionOption(decision).request
  if (request.route === 'accept') {
    return { path: `/subnet-triggers/${triggerId}/accept`, body: {} }
  }
  if (request.route === 'delete') {
    return { path: `/subnet-triggers/${triggerId}/delete`, body: {} }
  }
  if (request.route === 'preset') {
    return { path: `/subnet-triggers/${triggerId}/retype/${request.preset}`, body: {} }
  }
  return {
    path: `/subnet-triggers/${triggerId}/retype`,
    body: { eventType: request.eventType, geographicType: request.geographicType },
  }
}
