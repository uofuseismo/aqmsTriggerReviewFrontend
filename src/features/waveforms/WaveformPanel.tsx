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
import { LuZoomOut } from 'react-icons/lu'
import { AXIS_HEIGHT, LANE_HEIGHT } from './laneHeight'
import { useWaveforms } from './useWaveforms'
import { buildRecordSection, type TraceOrder } from './waveforms'

/**
 * Chart.js is ~60 KB gzipped and nobody on the trigger list needs it, so it
 * loads with the record section rather than with the app.
 */
const WaveformChart = lazy(() =>
  import('./WaveformChart').then((module) => ({ default: module.WaveformChart })),
)

const ORDER_KEY = 'trigger-review:trace-order'

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
 * Only an explicit Station is honoured: nothing stored means the default.
 */
function readOrder(): TraceOrder {
  try {
    return window.localStorage.getItem(ORDER_KEY) === 'station' ? 'station' : DEFAULT_ORDER
  } catch {
    return DEFAULT_ORDER
  }
}

function writeOrder(order: TraceOrder) {
  try {
    window.localStorage.setItem(ORDER_KEY, order)
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const ORDERS: { value: TraceOrder; label: string }[] = [
  { value: 'peakTime', label: 'Peak time' },
  { value: 'station', label: 'Station' },
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
  const [order, setOrder] = useState<TraceOrder>(readOrder)
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

  const traces = useMemo(() => buildRecordSection(channels, order), [channels, order])

  const onReady = useCallback((reset: () => void) => {
    resetRef.current = reset
    setCanReset(true)
  }, [])

  const chooseOrder = (next: TraceOrder) => {
    setOrder(next)
    writeOrder(next)
  }

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
          {ORDERS.map((option) => (
            <Button
              key={option.value}
              aria-pressed={order === option.value}
              // Solid for the chosen one: `subtle` against `outline` read
              // backwards, the white button looking like the selected one.
              variant={order === option.value ? 'solid' : 'outline'}
              colorPalette="gray"
              onClick={() => chooseOrder(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </ButtonGroup>
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
        <Suspense fallback={<Skeleton height="100%" rounded="md" />}>
          <WaveformChart
            traces={traces}
            onReady={onReady}
            onZoomedChange={setZoomed}
          />
        </Suspense>
      </Box>
    </Stack>
  )
}
