import { useContext } from 'react'
import { DecisionQueueContext, type DecisionQueueValue } from './decisionQueueContext'

export function useDecisionQueue(): DecisionQueueValue {
  const value = useContext(DecisionQueueContext)
  if (value === null) {
    throw new Error('useDecisionQueue must be used within a <DecisionQueueProvider>')
  }
  return value
}
