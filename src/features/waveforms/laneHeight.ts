/**
 * Height of one trace's lane in pixels.
 *
 * Compact on purpose. A trigger brings forty-odd vertical channels, and the
 * question asked of them is a pattern across the whole section - does energy
 * sweep across the network, arrive everywhere at once, or not at all - so
 * seeing more traces at a time beats seeing each one larger.
 *
 * Its own module so the panel can size its container without importing the
 * chart, which would pull Chart.js into the main bundle.
 */
export const LANE_HEIGHT = 48

/** Room for the time axis under the last lane. */
export const AXIS_HEIGHT = 40
