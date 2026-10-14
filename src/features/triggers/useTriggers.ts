import { useContext } from 'react'
import { TriggersContext, type TriggersContextValue } from './triggersContext'

/** The trigger list held by <TriggersProvider>, shared by every page. */
export function useTriggers(): TriggersContextValue {
  const value = useContext(TriggersContext)
  if (value === null) {
    throw new Error('useTriggers must be used within a <TriggersProvider>')
  }
  return value
}
