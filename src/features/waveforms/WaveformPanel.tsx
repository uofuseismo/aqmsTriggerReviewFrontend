import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  HStack,
  Portal,
  Skeleton,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LuX, LuZoomOut } from 'react-icons/lu'
import { Tooltip } from '../../components/ui/Tooltip'
import { distanceKm } from '../stations/stations'
import { useStations } from '../stations/useStations'
import { LaneMenu } from './LaneMenu'
import { AXIS_HEIGHT, LANE_HEIGHT } from './laneHeight'
import { useWaveforms } from './useWaveforms'
import { buildRecordSection, channelStationKey, type TraceOrder } from './waveforms'

/**
 * Chart.js is ~60 KB gzipped and nobody on the trigger list needs it, so it
 * loads with the record section rather than with the app.
 */
const WaveformChart = lazy(() =>
  import('./WaveformChart').then((module) => ({ default: module.WaveformChart })),
)

const ORDER_KEY = 'trigger-review:trace-order'
const ROOT_KEY = 'trigger-review:root-station'

/**
 * Peak time unless the analyst has chosen otherwise: it is what analysts
 * reach for, since it shows moveout across the network at a glance.
 */
const DEFAULT_ORDER: TraceOrder = 'peakTime'

/**
 * The analyst's last choice of order, so it holds from one trigger to the
 * next and across reloads. Storage can be missing or refuse (private
 * windows), and then it is simply the default every time.
 *
 * Only an explicit Station or Distance is honoured: nothing stored means
 * the default.
 */
function readOrder(): TraceOrder {
  try {
    const stored = window.localStorage.getItem(ORDER_KEY)
    return stored === 'station' || stored === 'distance' ? stored : DEFAULT_ORDER
  } catch {
    return DEFAULT_ORDER
  }
}

/**
 * The root station, "NET.STA". Remembered like the order, so an analyst
 * watching one corner of the network keeps it from trigger to trigger.
 */
function readRoot(): string | null {
  try {
    return window.localStorage.getItem(ROOT_KEY)
  } catch {
    return null
  }
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const ORDERS: { value: TraceOrder; label: string }[] = [
  { value: 'peakTime', label: 'Peak time' },
  { value: 'station', label: 'Station' },
  { value: 'distance', label: 'Distance' },
]

export interface WaveformPanelProps {
  triggerId: number
  /**
   * Where the controls row goes: an element in the page's sticky header, so
   * the order toggle and Reset zoom stay in reach while the section scrolls.
   * Null until that element exists, and then the row renders in place.
   */
  controlsSlot?: HTMLElement | null
}

export function WaveformPanel({ triggerId, controlsSlot = null }: WaveformPanelProps) {
  const { channels, loading, error, reload } = useWaveforms(triggerId)
  const { locations, loading: stationsLoading, error: stationsError } = useStations()
  const [order, setOrder] = useState<TraceOrder>(readOrder)
  const [rootKey, setRootKey] = useState<string | null>(readRoot)
  /** Each lane's vertical centre on screen, from the chart, for the lane menus. */
  const [laneCentres, setLaneCentres] = useState<number[]>([])
  const resetRef = useRef<(() => void) | null>(null)
  const [canReset, setCanReset] = useState(false)
  /** Zoomed or panned away from the full record - something to reset. */
  const [zoomed, setZoomed] = useState(false)

  /*
    Whether the chart is on screen, so the phone's floating Reset button is
    not left hovering over the page once the traces have scrolled away.
  */
  const [chartBox, setChartBox] = useState<HTMLDivElement | null>(null)
  const [chartInView, setChartInView] = useState(false)
  useEffect(() => {
    if (chartBox === null) return
    const observer = new IntersectionObserver(([entry]) => setChartInView(entry.isIntersecting))
    observer.observe(chartBox)
    return () => observer.disconnect()
  }, [chartBox])

  /*
    The remembered root applies only to a trigger that station recorded.

    It is remembered so an analyst watching one area keeps it from trigger
    to trigger - but on a trigger without that station, a root tag and a
    column of distances measured from a trace that is not there read as a
    mistake. So there it simply lies dormant: no tag, no distances, the
    default order. The next trigger that does include it picks it up again,
    and choosing a new root on any trigger replaces it.
  */
  const activeRoot =
    rootKey !== null && channels.some((channel) => channelStationKey(channel) === rootKey)
      ? rootKey
      : null

  // Distance from the root to every station in this section.
  const distances = useMemo(() => {
    const root = activeRoot === null ? undefined : locations.get(activeRoot)
    if (root === undefined) return undefined
    const byStation = new Map<string, number>()
    for (const channel of channels) {
      const key = channelStationKey(channel)
      const location = locations.get(key)
      if (location !== undefined) byStation.set(key, distanceKm(root, location))
    }
    return byStation
  }, [activeRoot, locations, channels])

  // Distance needs a root with a known location; until then, the default.
  const effectiveOrder: TraceOrder =
    order === 'distance' && distances === undefined ? DEFAULT_ORDER : order
  const traces = useMemo(
    () => buildRecordSection(channels, effectiveOrder, distances),
    [channels, effectiveOrder, distances],
  )

  const onReady = useCallback((reset: () => void) => {
    resetRef.current = reset
    setCanReset(true)
  }, [])

  const chooseOrder = (next: TraceOrder) => {
    setOrder(next)
    remember(ORDER_KEY, next)
  }

  const setRoot = (key: string) => {
    setRootKey(key)
    remember(ROOT_KEY, key)
    // Choosing a root is asking for the distance order.
    chooseOrder('distance')
  }

  const clearRoot = () => {
    setRootKey(null)
    remember(ROOT_KEY, null)
    if (order === 'distance') chooseOrder(DEFAULT_ORDER)
  }

  /** Why Distance cannot be chosen yet, or null when it can. */
  const distanceBlocked =
    distances !== undefined
      ? null
      : stationsError !== null
        ? `Station locations could not be loaded: ${stationsError}`
        : stationsLoading
          ? 'Station locations are still loading.'
          : activeRoot !== null
            ? `No location is known for the root station, ${activeRoot}.`
            : rootKey !== null
              ? `The root station, ${rootKey}, did not record this trigger. Choose another from the ⋮ beside any station.`
              : 'Choose a root station first, from the ⋮ beside any station.'

  const unfiltered = traces.filter((trace) => trace.channel.partiallyUnfiltered)

  if (loading && channels.length === 0) {
    return (
      <HStack gap="3" py="10" justify="center" color="fg.muted">
        <Spinner size="sm" />
        <Text>Loading waveforms…</Text>
      </HStack>
    )
  }

  if (error !== null) {
    return (
      <Alert.Root status="warning" role="status">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Could not load the waveforms</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
        <Button size="xs" variant="outline" alignSelf="center" onClick={reload}>
          Try again
        </Button>
      </Alert.Root>
    )
  }

  if (traces.length === 0) {
    return (
      <Text color="fg.muted" fontSize="sm" py="10" textAlign="center">
        The backend returned no waveforms for this trigger.
      </Text>
    )
  }

  const controls = (
    <HStack justify="space-between" wrap="wrap" gap="2">
      <HStack gap="2">
        <Text fontSize="xs" color="fg.muted" id="trace-order-label">
          Order
        </Text>
        <ButtonGroup size="xs" variant="outline" attached aria-labelledby="trace-order-label">
          {ORDERS.map((option) => {
            const blocked = option.value === 'distance' ? distanceBlocked : null
            const button = (
              <Button
                key={option.value}
                aria-pressed={effectiveOrder === option.value}
                // Solid for the chosen one: `subtle` against `outline` read
                // backwards, the white button looking like the selected one.
                variant={effectiveOrder === option.value ? 'solid' : 'outline'}
                colorPalette="gray"
                // aria-disabled, not disabled, so the tooltip saying why
                // still opens on hover and focus.
                aria-disabled={blocked !== null}
                onClick={() => {
                  if (blocked === null) chooseOrder(option.value)
                }}
              >
                {option.label}
              </Button>
            )
            return blocked === null ? (
              button
            ) : (
              <Tooltip key={option.value} content={blocked}>
                {button}
              </Tooltip>
            )
          })}
        </ButtonGroup>
        {activeRoot !== null && (
          <Button
            size="xs"
            variant="subtle"
            colorPalette="utahRed"
            onClick={clearRoot}
            aria-label={`Clear the root station, ${activeRoot}`}
          >
            Root: {activeRoot} <LuX />
          </Button>
        )}
        <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
          {traces.length} vertical channel{traces.length === 1 ? '' : 's'}
        </Text>
      </HStack>
      {/* Wide screens only: on a phone the gestures are the familiar
          ones, and Reset floats under the thumb instead (below). */}
      <HStack gap="2" display={{ base: 'none', md: 'flex' }}>
        <Text fontSize="2xs" color="fg.muted" display={{ base: 'none', lg: 'block' }}>
          drag to zoom · shift-scroll to zoom · shift-drag to pan
        </Text>
        <Button
          size="xs"
          variant="outline"
          disabled={!canReset || !zoomed}
          onClick={() => resetRef.current?.()}
        >
          <LuZoomOut /> Reset zoom
        </Button>
      </HStack>
    </HStack>
  )

  return (
    <Stack gap="2">
      {controlsSlot ? createPortal(controls, controlsSlot) : controls}

      {canReset && zoomed && chartInView && (
        <Portal>
          <Button
            display={{ base: 'inline-flex', md: 'none' }}
            position="fixed"
            right="4"
            // Above the review page's decision bar when there is one.
            bottom="calc(var(--decision-bar-height, env(safe-area-inset-bottom)) + 1rem)"
            zIndex="docked"
            size="md"
            rounded="full"
            boxShadow="lg"
            onClick={() => resetRef.current?.()}
          >
            <LuZoomOut /> Reset zoom
          </Button>
        </Portal>
      )}

      {unfiltered.length > 0 && (
        // Named, not counted: it tells the analyst which trace to distrust.
        <Text fontSize="xs" color="fg.muted">
          Unfiltered (no design for the sampling rate):{' '}
          {unfiltered.map((trace) => trace.channel.streamId).join(', ')}
        </Text>
      )}

      <Box
        ref={setChartBox}
        height={`${traces.length * LANE_HEIGHT + AXIS_HEIGHT}px`}
        minH="12rem"
        borderWidth="1px"
        rounded="lg"
        bg="bg.panel"
        py="2"
      >
        {/* Positioned, so the lane menus can sit over the chart's gutter at
            the pixel offsets the chart reports. */}
        <Box position="relative" height="100%">
          <Suspense fallback={<Skeleton height="100%" rounded="md" />}>
            <WaveformChart
              traces={traces}
              onReady={onReady}
              onZoomedChange={setZoomed}
              rootKey={activeRoot ?? undefined}
              onLanes={setLaneCentres}
            />
            {traces.map((trace) => {
              const top = laneCentres[trace.lane]
              if (top === undefined) return null
              const key = channelStationKey(trace.channel)
              return (
                <LaneMenu
                  key={trace.channel.streamId}
                  streamId={trace.channel.streamId}
                  top={top}
                  isRoot={key === activeRoot}
                  hasLocation={locations.has(key)}
                  onSetRoot={() => setRoot(key)}
                  onClearRoot={clearRoot}
                />
              )
            })}
          </Suspense>
        </Box>
      </Box>
    </Stack>
  )
}
