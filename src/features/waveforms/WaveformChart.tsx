import {
  Chart,
  Decimation,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { useEffect, useRef } from 'react'
import { useColorMode } from '../../components/ui/useColorMode'
import { chooseStepMs, formatTick, timeTicks } from './timeTicks'
import { laneY, recordSectionExtent, segmentPoints, type Trace } from './waveforms'

Chart.register(LineController, LineElement, PointElement, LinearScale, Decimation, zoomPlugin)

/**
 * Width of the label column to the left of the traces.
 *
 * Labels sit beside the traces rather than above them, as they do in the
 * duty-review record section: at a compact lane height there is no gap
 * above a trace to put one in, and a label drawn over the trace hides the
 * start of the window.
 *
 * Wide enough for the lane's menu button (see WaveformPanel) and then
 * "PCCW 123 km" over "UU ENZ 01".
 */
const GUTTER_PX = 100

/** Where the label text starts: after the lane's menu button. */
const LABEL_X = 24

/** Space above the top lane and below the bottom one, in lanes. */
const HEADROOM = 0.5

/** How close two zoom limits may get: a tenth of a second fills the width. */
const MIN_RANGE_MS = 100

function palette(mode: 'light' | 'dark') {
  return mode === 'dark'
    ? {
        trace: '#C4C4CC',
        grid: '#3A3A3A',
        label: '#A1A1AA',
        station: '#E4E4E7',
        root: '#F16A6A',
        laneBand: 'rgba(255,255,255,0.03)',
      }
    : {
        trace: '#3F3F46',
        grid: '#E4E4E7',
        label: '#52525B',
        station: '#18181B',
        root: '#C92A2A',
        laneBand: 'rgba(0,0,0,0.025)',
      }
}

export interface WaveformChartProps {
  traces: Trace[]
  /** Called with a reset function once the chart exists. */
  onReady?: (reset: () => void) => void
  /**
   * Told whether the view is zoomed or panned, whenever that may have
   * changed. Should be stable (a state setter is ideal): it is a dependency
   * of the chart's construction.
   */
  onZoomedChange?: (zoomed: boolean) => void
  /** "NET.STA" of the root station, whose lane label is marked. */
  rootKey?: string
  /**
   * Told the vertical pixel centre of each lane, in lane order, whenever the
   * layout changes - so controls can be placed over the gutter beside each
   * label. Should be stable (a state setter is ideal).
   */
  onLanes?: (centres: number[]) => void
}

/**
 * A record section: one trace per lane.
 *
 * Chart.js rather than a wrapper library, because the chart is built once
 * from data that does not change while it is on screen, and the imperative
 * instance is easier to reason about than a component that rebuilds options
 * on every render.
 */
export function WaveformChart({
  traces,
  onReady,
  onZoomedChange,
  rootKey,
  onLanes,
}: WaveformChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { colorMode } = useColorMode()
  const mode: 'light' | 'dark' = colorMode === 'dark' ? 'dark' : 'light'

  useEffect(() => {
    const canvas = canvasRef.current
    const extent = recordSectionExtent(traces)
    if (canvas === null || extent === null) return

    /*
      The tick step, chosen once per layout in afterBuildTicks and read back
      by the label callback, so the two always agree on whether a label
      carries tenths of a second.
    */
    let tickStepMs = chooseStepMs(extent.maxMs - extent.minMs, 8)
    const ink = palette(mode)

    const datasets = traces.flatMap((trace) =>
      trace.channel.segments.map((segment) => ({
        data: segmentPoints(segment, trace.lane, trace.channel.peak),
        borderColor: ink.trace,
        borderWidth: 0.8,
        pointRadius: 0,
        tension: 0,
        // Segments are separate datasets so a real gap in the record stays a
        // gap instead of being bridged by a straight line that never happened.
        spanGaps: false,
      })),
    )

    /** Alternate lane shading, behind the traces, so a row is easy to follow. */
    const bands: Plugin<'line'> = {
      id: 'waveform-bands',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart
        ctx.save()
        ctx.fillStyle = ink.laneBand
        for (const trace of traces) {
          if (trace.lane % 2 === 0) continue
          const centre = laneY(trace.lane)
          const top = scales.y.getPixelForValue(centre + 0.5)
          const bottom = scales.y.getPixelForValue(centre - 0.5)
          ctx.fillRect(0, top, chartArea.right, bottom - top)
        }
        ctx.restore()
      },
    }

    /**
     * Lane labels, in the gutter to the left of the traces: the station,
     * its distance from the root when one is set, and the channel beneath.
     * The root's own lane says "root" in place of a distance of zero.
     */
    const overlay: Plugin<'line'> = {
      id: 'waveform-overlay',
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart
        const y = scales.y

        ctx.save()
        ctx.textAlign = 'left'
        for (const trace of traces) {
          const centre = y.getPixelForValue(laneY(trace.lane))
          const { station, network, channel, locationCode } = trace.channel
          const isRoot = rootKey !== undefined && `${network}.${station}` === rootKey
          ctx.font = '600 11px system-ui, sans-serif'
          ctx.fillStyle = isRoot ? ink.root : ink.station
          ctx.textBaseline = 'bottom'
          ctx.fillText(station, LABEL_X, centre)
          if (isRoot || trace.distanceKm !== undefined) {
            const after = LABEL_X + ctx.measureText(station).width + 4
            ctx.font = isRoot ? '600 10px system-ui, sans-serif' : '10px system-ui, sans-serif'
            ctx.fillStyle = isRoot ? ink.root : ink.label
            ctx.fillText(isRoot ? 'root' : `${Math.round(trace.distanceKm ?? 0)} km`, after, centre)
          }
          ctx.font = '10px ui-monospace, monospace'
          ctx.fillStyle = ink.label
          ctx.textBaseline = 'top'
          ctx.fillText(
            [network, channel, locationCode].filter(Boolean).join(' '),
            LABEL_X,
            centre + 1,
          )
        }
        ctx.restore()
      },
    }

    /*
      Where each lane is on screen, for the controls laid over the gutter.
      Reported after every layout - a resize moves them - but only passed on
      when they have actually changed, since a zoom lays out again too.
    */
    let reportedLanes = ''
    const lanes: Plugin<'line'> = {
      id: 'waveform-lanes',
      afterLayout(chart) {
        const centres = traces.map((trace) =>
          Math.round(chart.scales.y.getPixelForValue(laneY(trace.lane))),
        )
        const key = centres.join(',')
        if (key === reportedLanes) return
        reportedLanes = key
        onLanes?.(centres)
      },
    }

    const options: ChartOptions<'line'> = {
      parsing: false,
      normalized: true,
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: GUTTER_PX, right: 8 } },
      // Nothing here is hoverable, and hit-testing ~400 000 points to decide
      // that costs real time.
      events: [],
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        // min-max, never LTTB: on a seismogram the peak amplitude IS the
        // signal, and LTTB is free to drop the very sample being looked for.
        decimation: { enabled: true, algorithm: 'min-max' },
        zoom: {
          limits: { x: { min: extent.minMs, max: extent.maxMs, minRange: MIN_RANGE_MS } },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: 'shift',
            /*
              The modifier is a mouse-only guard inside the plugin, so on a
              phone one finger would pan and the page could not be scrolled
              past the chart. One finger belongs to the page; two to the chart.
            */
            onPanStart: ({ event }) => {
              const touch = event?.srcEvent as PointerEvent | undefined
              if (touch !== undefined && touch.pointerType !== 'mouse') {
                return (event?.pointers?.length ?? 1) >= 2
              }
              return true
            },
            onPanComplete: ({ chart }) => onZoomedChange?.(chart.isZoomedOrPanned()),
          },
          zoom: {
            // Shift, so a plain wheel still scrolls a section this tall.
            wheel: { enabled: true, modifierKey: 'shift' },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: 'rgba(120,120,120,0.15)' },
            mode: 'x',
            onZoomComplete: ({ chart }) => onZoomedChange?.(chart.isZoomedOrPanned()),
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: extent.minMs,
          max: extent.maxMs,
          grid: { color: ink.grid },
          border: { color: ink.grid },
          ticks: {
            color: ink.label,
            maxRotation: 0,
            autoSkip: false,
            font: { size: 10 },
            callback: (value) => formatTick(Number(value), tickStepMs),
          },
          afterBuildTicks: (axis) => {
            // About 90px per label: a phone gets three or four, a desktop ten.
            const target = Math.max(3, Math.min(10, Math.floor((axis.width || 600) / 90)))
            tickStepMs = chooseStepMs(axis.max - axis.min, target)
            axis.ticks = timeTicks(axis.min, axis.max, target).map((value) => ({ value }))
          },
        },
        y: {
          type: 'linear',
          min: laneY(traces.length - 1) - HEADROOM,
          max: laneY(0) + HEADROOM,
          display: false,
          grid: { display: false },
        },
      },
    }

    const chart = new Chart(canvas, {
      type: 'line',
      data: { datasets },
      options,
      plugins: [bands, overlay, lanes],
    })

    /*
      Hand vertical scrolling back to the page. The zoom plugin's touch
      handling computes `touch-action: none` on the canvas, which makes the
      whole section a dead zone for scrolling on a phone; `pan-y` gives
      vertical swipes back to the browser. Set after construction, and
      `important`, because the plugin writes the inline style itself.
    */
    canvas.style.setProperty('touch-action', 'pan-y', 'important')
    onZoomedChange?.(false)
    onReady?.(() => {
      chart.resetZoom()
      onZoomedChange?.(false)
    })
    return () => chart.destroy()
  }, [traces, mode, onReady, onZoomedChange, rootKey, onLanes])

  return <canvas ref={canvasRef} aria-label="Waveform record section" role="img" />
}
