import { useSyncExternalStore } from 'react'

/**
 * Subscribes to a media query.
 *
 * useSyncExternalStore rather than state-set-in-an-effect, so the very first
 * render already has the right answer - otherwise the wrong layout renders
 * and is immediately swapped.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Chakra's `lg` breakpoint - where wide-screen-only tools, like user management, appear. */
export function useIsWideScreen(): boolean {
  return useMediaQuery('(min-width: 62em)')
}


/**
 * Chakra's `md` breakpoint - where the decision bar has room for every
 * outcome as its own button.
 */
export function useIsMediumScreen(): boolean {
  return useMediaQuery('(min-width: 48em)')
}
