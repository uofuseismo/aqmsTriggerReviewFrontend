import { Alert, Box, Button, HStack, Heading, Stack, Text } from '@chakra-ui/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LuArrowLeft, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { formatUtc } from '../format/dateTime'
import { prefetchAhead } from '../waveforms/useWaveforms'
import { WaveformPanel } from '../waveforms/WaveformPanel'
import { DecisionBar } from './DecisionBar'
import type { Decision } from './decisions'
import { triggerPath } from './paths'
import { useDecisionQueue } from './useDecisionQueue'
import { useTriggers } from './useTriggers'

/**
 * How many triggers' waveforms to fetch ahead of the one on screen.
 *
 * Two, so an analyst moving faster than one download per decision still
 * lands on traces that are already there. Kept under the waveform cache's
 * size (see useWaveforms), or prefetching would evict its own results.
 */
const PREFETCH_AHEAD = 2

/**
 * Reviewing one subnet trigger: its vertical waveforms, and the decision.
 *
 * Stepping between triggers - and moving on after a decision - follows the
 * trigger list in whatever order the analyst has it sorted: oldest first by
 * default, so "Next" is the next row down.
 */
export function TriggerReviewPage() {
  const { triggerId: rawId } = useParams()
  const triggerId = Number(rawId)
  const valid = Number.isSafeInteger(triggerId) && triggerId > 0
  const { ordered, loading } = useTriggers()
  const { getToken } = useAuth()
  const { submit } = useDecisionQueue()
  const navigate = useNavigate()
  /** The waveform panel's controls are portalled in here; see WaveformPanel. */
  const [controlsSlot, setControlsSlot] = useState<HTMLDivElement | null>(null)

  const index = ordered.findIndex((trigger) => trigger.id === triggerId)
  const trigger = index >= 0 ? ordered[index] : undefined
  const previous = index > 0 ? ordered[index - 1] : undefined
  const next = index >= 0 ? ordered[index + 1] : undefined

  /*
    Fetch the triggers the analyst will reach next while this one is being
    looked at, so the decide-and-move-on loop never stops for a download.
    The same order a decision moves in: down the list, then back up it once
    the bottom is reached.

    Keyed on the ids as a string, so a poll that returns the same list does
    not restart it.
  */
  const aheadKey = (
    index < 0
      ? []
      : [...ordered.slice(index + 1), ...ordered.slice(0, index).reverse()]
          .slice(0, PREFETCH_AHEAD)
          .map((candidate) => candidate.id)
  ).join(',')
  useEffect(() => {
    if (!valid || aheadKey === '') return
    return prefetchAhead(triggerId, aheadKey.split(',').map(Number), getToken())
  }, [valid, triggerId, aheadKey, getToken])

  /*
    Decide, then move straight on: the decision waits out its undo window in
    the queue while the next trigger is already loading here. Next is the
    next row down the sorted list; from the bottom of the list it is the row
    above; with nothing left, back to the (empty) list.
  */
  const followingId = next?.id ?? previous?.id
  const decide = useCallback(
    (decision: Decision) => {
      if (!valid || !submit(triggerId, decision)) return
      navigate(followingId === undefined ? '/' : triggerPath(followingId))
    },
    [valid, submit, triggerId, followingId, navigate],
  )

  if (!valid) {
    return (
      <Stack gap="3">
        <BackLink />
        <Text>“{rawId}” is not a trigger identifier.</Text>
      </Stack>
    )
  }

  return (
    <Stack gap="4">
      {/*
        The header and the waveform controls stay in view while the section
        scrolls on a wide screen, docked under the app header. On
        a phone there is no room for two pinned bars, so this one scrolls away
        with the page - and Reset zoom floats over the traces instead.
      */}
      <Box
        position={{ base: 'static', md: 'sticky' }}
        top="var(--app-header-height, 0px)"
        zIndex="sticky"
        bg="bg.subtle"
        mx="-1"
        px="1"
        py="2"
        // Separates the pinned header from the traces scrolling beneath it.
        borderBottomWidth={{ md: '1px' }}
      >
        <Stack gap="3">
          <HStack justify="space-between" wrap="wrap" gap="2">
            <BackLink />
            <HStack gap="1">
              <StepButton
                to={previous?.id}
                label="Previous"
                icon={<LuChevronLeft />}
                placement="start"
              />
              {trigger && (
                <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" px="1">
                  {index + 1} of {ordered.length}
                </Text>
              )}
              <StepButton to={next?.id} label="Next" icon={<LuChevronRight />} placement="end" />
            </HStack>
          </HStack>

          <Stack gap="0.5">
            <Heading as="h1" size="lg" fontWeight="semibold" fontVariantNumeric="tabular-nums">
              Trigger {triggerId}
            </Heading>
            <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
              {trigger
                ? `${formatUtc(trigger.time)} UTC · ${trigger.originSource}`
                : loading
                  ? 'Loading…'
                  : 'Trigger time unknown'}
            </Text>
          </Stack>

          {/* Collapsed until the panel has controls to put in it. */}
          <Box ref={setControlsSlot} _empty={{ display: 'none' }} />
        </Stack>
      </Box>

      {!loading && trigger === undefined && (
        <Alert.Root status="info">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              This trigger is not in the subnet-trigger list. It may already have been reviewed and
              relabelled.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <WaveformPanel triggerId={triggerId} controlsSlot={controlsSlot} />

      <DecisionBar onDecide={decide} triggerId={triggerId} />
    </Stack>
  )
}

function BackLink() {
  return (
    <Box asChild>
      <RouterLink to="/">
        <HStack gap="1.5" color="utahRed.fg" fontSize="sm">
          <LuArrowLeft aria-hidden />
          <Text>Triggers</Text>
        </HStack>
      </RouterLink>
    </Box>
  )
}

/** A link to a neighbouring trigger, or a lowered button at either end. */
function StepButton({
  to,
  label,
  icon,
  placement,
}: {
  to: number | undefined
  label: string
  icon: ReactNode
  placement: 'start' | 'end'
}) {
  const content =
    placement === 'start' ? (
      <>
        {icon} {label}
      </>
    ) : (
      <>
        {label} {icon}
      </>
    )
  if (to === undefined) {
    return (
      <Button size="xs" variant="ghost" disabled>
        {content}
      </Button>
    )
  }
  return (
    <Button size="xs" variant="ghost" asChild>
      <RouterLink to={triggerPath(to)} aria-label={`${label} trigger, ${to}`}>
        {content}
      </RouterLink>
    </Button>
  )
}
