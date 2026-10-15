import { apiGet } from '../../api/client'

/**
 * A station epoch from GET /stations.
 *
 * "Epoch" because one station can in principle appear more than once, with
 * different date ranges - a move, a re-siting. The data seen so far holds
 * exactly one per station, but the shape allows more.
 */
export interface RawStation {
  network: string
  name: string
  latitude: number
  /** Degrees east, 0-360, as everywhere else in this API. */
  longitude: number
  /** SECONDS since the epoch - not nanoseconds like the triggers. */
  onDate: number
  offDate: number
}

export interface StationLocation {
  /** "UU.PCCW" - unique across networks, unlike the bare name. */
  key: string
  network: string
  name: string
  latitude: number
  /** Signed degrees east, -180..180. */
  longitude: number
}

export function stationKey(network: string, name: string): string {
  return `${network}.${name}`
}

/** 0-360 degrees east to the signed form: Utah arrives as ~247, not ~-113. */
function toSignedLongitude(degreesEast: number): number {
  const wrapped = ((degreesEast % 360) + 360) % 360
  return wrapped > 180 ? wrapped - 360 : wrapped
}

/**
 * One location per station: the epoch running now, else the most recent.
 *
 * The question asked of it is "how far apart are these two stations", for
 * ordering traces - a station that moved a few hundred metres between epochs
 * would not change that answer, so there is no need to pick the epoch that
 * covers each trigger's time.
 */
export function indexStationLocations(
  rows: RawStation[],
  now: Date = new Date(),
): Map<string, StationLocation> {
  const nowSeconds = now.getTime() / 1000
  const best = new Map<string, RawStation>()
  const active = (row: RawStation) => row.onDate <= nowSeconds && nowSeconds <= row.offDate
  for (const row of rows) {
    if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue
    const key = stationKey(row.network, row.name)
    const existing = best.get(key)
    if (
      existing === undefined ||
      (active(row) && !active(existing)) ||
      (active(row) === active(existing) && row.onDate > existing.onDate)
    ) {
      best.set(key, row)
    }
  }
  const locations = new Map<string, StationLocation>()
  for (const [key, row] of best) {
    locations.set(key, {
      key,
      network: row.network,
      name: row.name,
      latitude: row.latitude,
      longitude: toSignedLongitude(row.longitude),
    })
  }
  return locations
}

/** Mean Earth radius (IUGG), km. */
const EARTH_RADIUS_KM = 6371.0088

/**
 * Great-circle distance in km, by the haversine formula.
 *
 * A sphere rather than the ellipsoid: across a regional network the two
 * differ by well under one percent, and the distances only ORDER traces -
 * nothing here is reported as a measurement.
 */
export function distanceKm(a: StationLocation, b: StationLocation): number {
  const radians = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * radians
  const dLon = (b.longitude - a.longitude) * radians
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function fetchStations(token: string | null, signal?: AbortSignal) {
  return apiGet<RawStation[]>('/stations', token, signal)
}
