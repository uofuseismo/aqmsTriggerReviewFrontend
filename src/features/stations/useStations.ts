import { useContext } from 'react'
import { StationsContext, type StationsContextValue } from './stationsContext'

/** Station locations, loaded once per session by <StationsProvider>. */
export function useStations(): StationsContextValue {
  const value = useContext(StationsContext)
  if (value === null) throw new Error('useStations must be used within a <StationsProvider>')
  return value
}
