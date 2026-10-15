import { createContext } from 'react'
import type { StationLocation } from './stations'

export interface StationsContextValue {
  /** Keyed by "NET.STA". Empty until loaded, and if loading failed. */
  locations: ReadonlyMap<string, StationLocation>
  loading: boolean
  error: string | null
}

export const StationsContext = createContext<StationsContextValue | null>(null)
