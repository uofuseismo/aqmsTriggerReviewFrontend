import { createContext } from 'react'
import type { Decision } from './decisions'

export interface DecisionQueueValue {
  /**
   * Queues a decision: the trigger leaves the list now, and the decision is
   * sent once the undo window has passed.
   *
   * @returns false if this trigger already has a decision queued - a second
   *          keypress before the page has moved on - and nothing was done.
   */
  submit: (triggerId: number, decision: Decision) => boolean
}

export const DecisionQueueContext = createContext<DecisionQueueValue | null>(null)
