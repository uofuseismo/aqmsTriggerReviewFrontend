import { IconButton, Menu, Portal, Stack, Text } from '@chakra-ui/react'
import { LuCrosshair, LuEllipsisVertical } from 'react-icons/lu'

export interface LaneMenuProps {
  /** "UU.PCCW.HHZ.01", for the accessible name. */
  streamId: string
  /** Vertical centre of the lane, px from the top of the chart. */
  top: number
  isRoot: boolean
  /** False when the station list has no location for this station. */
  hasLocation: boolean
  onSetRoot: () => void
  onClearRoot: () => void
}

/**
 * The menu beside a lane's label, in the gutter left of the traces.
 *
 * A real button laid over the canvas rather than something drawn on it, so
 * it can be clicked, tabbed to and announced. It shows a crosshair on the
 * root station's lanes, which also says at a glance which one that is.
 *
 * Lazily mounted: a section has forty-odd of these, and only the one opened
 * needs its menu in the document.
 */
export function LaneMenu({
  streamId,
  top,
  isRoot,
  hasLocation,
  onSetRoot,
  onClearRoot,
}: LaneMenuProps) {
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      positioning={{ placement: 'right-start' }}
      onSelect={(details) => {
        if (details.value === 'set-root') onSetRoot()
        if (details.value === 'clear-root') onClearRoot()
      }}
    >
      <Menu.Trigger asChild>
        <IconButton
          aria-label={`Options for ${streamId}`}
          size="2xs"
          variant="ghost"
          position="absolute"
          left="1"
          top={`${top - 10}px`}
          minW="5"
          h="5"
          color={isRoot ? 'utahRed.fg' : 'fg.muted'}
        >
          {isRoot ? <LuCrosshair /> : <LuEllipsisVertical />}
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="12rem">
            {isRoot ? (
              <Menu.Item value="clear-root">Clear root</Menu.Item>
            ) : (
              <Menu.Item value="set-root" disabled={!hasLocation}>
                <Stack gap="0">
                  <Text>Set as root</Text>
                  <Text fontSize="xs" color="fg.muted">
                    {hasLocation
                      ? 'Order every trace by distance from here'
                      : 'No location is known for this station'}
                  </Text>
                </Stack>
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
