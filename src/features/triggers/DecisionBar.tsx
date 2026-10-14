import { Box, Button, Container, HStack, Kbd, Menu, Portal, Stack, Text } from '@chakra-ui/react'
import { useEffect, useRef } from 'react'
import { LuChevronUp } from 'react-icons/lu'
import { satisfies } from '../../auth/permissions'
import { useAuth } from '../../auth/useAuth'
import { Tooltip } from '../../components/ui/Tooltip'
import { useIsMediumScreen } from '../../hooks/useMediaQuery'
import {
  ACCEPTANCES,
  DECISIONS,
  REJECTIONS,
  type Decision,
  type DecisionOption,
  type DecisionSide,
} from './decisions'

/**
 * Tinted, not solid. A rejection is a label, not a deletion, and a row of
 * solid red buttons reads as "danger". The side is also named in a heading,
 * so the red/green split is never the only way to tell them apart.
 */
const PALETTE: Record<DecisionSide, string> = {
  reject: 'red',
  accept: 'green',
}
const HEADING: Record<DecisionSide, string> = {
  reject: 'Reject',
  accept: 'Accept',
}

/**
 * Whether a keypress should be left to whatever has focus rather than taken
 * as a decision: typing in a field, any modifier held, a key held down, a
 * dialog (the session lock, user management) open over the page, or an open
 * menu, where letters jump between items.
 */
function ignoreKey(event: KeyboardEvent): boolean {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return true
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [role="menu"][data-state="open"]',
    ) !== null
  )
}

/**
 * How long the keys stay deaf after a new trigger opens, in milliseconds.
 *
 * A decision moves straight on to the next trigger, so without this a
 * double-tapped key decides two triggers - the second one before it was
 * even on screen. Short enough that nobody deliberate will hit it.
 */
const SETTLE_MS = 400

export interface DecisionBarProps {
  onDecide: (decision: Decision) => void
  /** The trigger on screen; a change restarts the settle period. */
  triggerId: number
}

/**
 * The decision, pinned to the bottom of the screen.
 *
 * Every outcome is its own button where there is room: one click per
 * trigger, with every option in view and its shortcut key on its face. On a
 * phone five buttons do not fit one row, so each side collapses to a menu.
 *
 * The keys work at every width - a tablet with a keyboard is still a
 * keyboard.
 *
 * Rendered only for read-write and admin accounts: a read-only analyst may
 * look, but none of this - the bar, its spacer or its keys - exists for them.
 * The backend refuses the write regardless; this keeps the UI honest about
 * it. Gated on the PERMISSION rather than `can()`, which is false whenever
 * the session has lapsed - and the bar should not vanish behind the lock
 * screen and reappear on signing back in.
 */
export function DecisionBar({ onDecide, triggerId }: DecisionBarProps) {
  const isMedium = useIsMediumScreen()
  const { status, permission } = useAuth()
  const allowed = satisfies(permission, 'read_write')
  const bar = useRef<HTMLDivElement>(null)
  const settledAt = useRef(0)

  useEffect(() => {
    settledAt.current = performance.now() + SETTLE_MS
  }, [triggerId])

  useEffect(() => {
    if (!allowed || status !== 'active') return
    const onKey = (event: KeyboardEvent) => {
      if (ignoreKey(event) || performance.now() < settledAt.current) return
      const option = DECISIONS.find((candidate) => candidate.key === event.key.toLowerCase())
      if (option === undefined) return
      event.preventDefault()
      onDecide(option.value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allowed, status, onDecide])

  /*
    Published so the spacer below can match it, and anything else floating
    at the bottom of the screen - the phone's Reset zoom button - can sit
    above the bar rather than under it.
  */
  useEffect(() => {
    const element = bar.current
    if (!element) return
    const root = document.documentElement
    const publish = () =>
      root.style.setProperty('--decision-bar-height', `${element.getBoundingClientRect().height}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--decision-bar-height')
    }
  }, [allowed])

  if (!allowed) return null

  /*
    Fixed to the window rather than sticky inside the page: sticky can only
    span the page's content column, which left the bar looking like a card
    floating over the traces with gaps either side. The buttons still line
    up with the content, through a container matching the app shell's, and
    a spacer after it keeps the last trace from ending up underneath it.
  */
  return (
    <>
      <Box
        ref={bar}
        role="group"
        aria-label="Decision"
        position="fixed"
        left="0"
        right="0"
        bottom="0"
        zIndex="sticky"
        bg="bg.panel"
        borderTopWidth="1px"
        shadow="0 -4px 12px -6px rgba(0,0,0,0.15)"
        pt="3"
        css={{
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <Container maxW="6xl">
          {isMedium ? (
            <HStack justify="space-between" align="flex-end" gap="6">
              <ButtonGroupWithHeading side="reject" options={REJECTIONS} onDecide={onDecide} />
              <ButtonGroupWithHeading side="accept" options={ACCEPTANCES} onDecide={onDecide} />
            </HStack>
          ) : (
            <HStack justify="space-between" gap="3">
              <DecisionMenu side="reject" options={REJECTIONS} onDecide={onDecide} />
              <DecisionMenu side="accept" options={ACCEPTANCES} onDecide={onDecide} />
            </HStack>
          )}
        </Container>
      </Box>
      {/* Holds the bar's height at the end of the page, so scrolling to the
        bottom brings the last trace out from under it. */}
      <Box aria-hidden height="var(--decision-bar-height, 5rem)" flexShrink={0} />
    </>
  )
}

function ButtonGroupWithHeading({
  side,
  options,
  onDecide,
}: {
  side: DecisionSide
  options: DecisionOption[]
  onDecide: (decision: Decision) => void
}) {
  const align = side === 'reject' ? 'flex-start' : 'flex-end'
  return (
    <Stack gap="1" align={align}>
      <Text
        fontSize="2xs"
        fontWeight="semibold"
        letterSpacing="wider"
        textTransform="uppercase"
        color="fg.muted"
      >
        {HEADING[side]}
      </Text>
      <HStack gap="2">
        {options.map((option) => (
          <Tooltip
            key={option.value}
            // Above: below the bar is the edge of the screen.
            positioning={{ placement: 'top' }}
            content={
              <>
                {option.description} Shortcut: <Kbd size="sm">{option.key.toUpperCase()}</Kbd>
              </>
            }
          >
            <Button
              size="sm"
              variant="subtle"
              colorPalette={PALETTE[side]}
              aria-keyshortcuts={option.key.toUpperCase()}
              aria-label={`${HEADING[side]}: ${option.label}`}
              onClick={() => onDecide(option.value)}
            >
              {option.label}
              <Kbd size="sm" variant="outline" aria-hidden>
                {option.key.toUpperCase()}
              </Kbd>
            </Button>
          </Tooltip>
        ))}
      </HStack>
    </Stack>
  )
}

function DecisionMenu({
  side,
  options,
  onDecide,
}: {
  side: DecisionSide
  options: DecisionOption[]
  onDecide: (decision: Decision) => void
}) {
  return (
    <Menu.Root
      positioning={{ placement: side === 'reject' ? 'top-start' : 'top-end' }}
      onSelect={(details) => onDecide(details.value as Decision)}
    >
      <Menu.Trigger asChild>
        <Button size="md" variant="subtle" colorPalette={PALETTE[side]} flex="1">
          {HEADING[side]} as… <LuChevronUp />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content maxW="min(20rem, calc(100vw - 2rem))">
            {options.map((option) => (
              // The description sits under the label: a phone has no hover,
              // so this is where the tooltip's explanation goes.
              <Menu.Item key={option.value} value={option.value} py="2.5" alignItems="flex-start">
                <Stack gap="0.5">
                  <Text fontWeight="medium">{option.label}</Text>
                  <Text fontSize="xs" color="fg.muted" whiteSpace="normal">
                    {option.description}
                  </Text>
                </Stack>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  )
}
