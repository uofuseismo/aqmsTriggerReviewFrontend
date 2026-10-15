import { Alert, Box, Button, HStack, Heading, Spinner, Stack, Text } from '@chakra-ui/react'
import { useDeferredValue, useMemo, useState } from 'react'
import { LuRefreshCw } from 'react-icons/lu'
import { formatLocalTimeOnly } from '../format/dateTime'
import { filterTriggers } from './filterTriggers'
import { TriggerSearch } from './TriggerSearch'
import { TriggerTable } from './TriggerTable'
import { useTriggers } from './useTriggers'

export function TriggerListPage() {
  const { triggers, loading, error, fetchedAt, reload } = useTriggers()
  const [query, setQuery] = useState('')

  // The box updates on every keystroke; the table may lag a frame behind.
  const deferredQuery = useDeferredValue(query)
  const visible = useMemo(
    () => filterTriggers(triggers, deferredQuery),
    [triggers, deferredQuery],
  )
  const filtering = deferredQuery.trim() !== ''

  return (
    <Stack gap="4">
      <HStack justify="space-between" align="center" wrap="wrap" gap="2">
        <HStack gap="3" align="baseline" wrap="wrap">
          <Heading as="h1" size="lg" fontWeight="semibold">
            Subnet triggers
          </Heading>
          {!loading && !error && (
            <Text fontSize="sm" color="fg.muted" fontVariantNumeric="tabular-nums">
              {filtering
                ? `${visible.length} of ${triggers.length}`
                : `${triggers.length} to review`}
              {fetchedAt && ` · updated ${formatLocalTimeOnly(fetchedAt)}`}
            </Text>
          )}
        </HStack>
        <HStack gap="2" flex={{ base: '1 1 100%', sm: '0 0 auto' }}>
          <TriggerSearch value={query} onChange={setQuery} />
          <Button
            size="sm"
            variant="outline"
            onClick={reload}
            loading={loading && triggers.length > 0}
          >
            <LuRefreshCw /> Refresh
          </Button>
        </HStack>
      </HStack>

      {error && (
        <Alert.Root status="error" role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {loading && triggers.length === 0 ? (
        <HStack gap="3" py="10" justify="center" color="fg.muted">
          <Spinner size="sm" />
          <Text>Loading subnet triggers…</Text>
        </HStack>
      ) : visible.length === 0 && !error ? (
        <Box py="10" textAlign="center" color="fg.muted">
          <Text>
            {filtering
              ? `No trigger identifier matches “${deferredQuery.trim()}”.`
              : 'No subnet triggers waiting for review.'}
          </Text>
        </Box>
      ) : (
        // Narrow content, so the table is held to its own width rather than
        // stretched across a wide screen with the columns miles apart, and
        // centred in the space that leaves.
        <Box
          borderWidth="1px"
          rounded="lg"
          overflow="hidden"
          bg="bg.panel"
          width="full"
          maxW={{ md: '32rem' }}
          mx="auto"
        >
          <TriggerTable triggers={visible} />
        </Box>
      )}
    </Stack>
  )
}
