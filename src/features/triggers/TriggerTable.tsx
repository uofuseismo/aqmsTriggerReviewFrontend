import { Box, Link, Table } from '@chakra-ui/react'
import { memo, useMemo } from 'react'
import { LuArrowDown, LuArrowUp } from 'react-icons/lu'
import { Link as RouterLink, useNavigate } from 'react-router'
import { formatUtc } from '../format/dateTime'
import { triggerPath } from './paths'
import { sortTriggers, type SortKey } from './sortTriggers'
import type { SubnetTrigger } from './types'
import { useTriggers } from './useTriggers'

interface ColumnSpec {
  key: SortKey
  label: string
  numeric?: boolean
}

const COLUMNS: ColumnSpec[] = [
  { key: 'id', label: 'Trigger', numeric: true },
  { key: 'time', label: 'Time (UTC)' },
  { key: 'originSource', label: 'Source' },
]

/**
 * Memoised because filtering re-renders the table on every keystroke; the
 * trigger objects keep their identity, so surviving rows skip rendering.
 */
const TriggerRow = memo(function TriggerRow({
  trigger,
  onOpen,
}: {
  trigger: SubnetTrigger
  onOpen: (id: number) => void
}) {
  return (
    /*
      The whole row opens the trigger, because on a phone the id alone is a
      small target. The link in the first cell is still the real control - it
      is what the keyboard and a screen reader reach, and what middle-click
      opens in a new tab - so the row's click handler is only a convenience
      and steps aside for clicks that land on the link itself.
    */
    <Table.Row
      cursor="pointer"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) return
        onOpen(trigger.id)
      }}
    >
      <Table.Cell textAlign="end" fontVariantNumeric="tabular-nums">
        <Link
          asChild
          variant="underline"
          color="utahRed.fg"
          fontWeight="medium"
          textUnderlineOffset="3px"
        >
          <RouterLink to={triggerPath(trigger.id)}>{trigger.id}</RouterLink>
        </Link>
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap" fontVariantNumeric="tabular-nums">
        {formatUtc(trigger.time)}
      </Table.Cell>
      <Table.Cell whiteSpace="nowrap">{trigger.originSource || '—'}</Table.Cell>
    </Table.Row>
  )
})

/**
 * One table at every width.
 *
 * The duty-review list swaps to cards on a phone because eight columns will
 * not fit one. Three will: an id, a timestamp and a short source code are
 * about 230px of text, so the same table serves both.
 */
export function TriggerTable({ triggers }: { triggers: SubnetTrigger[] }) {
  const navigate = useNavigate()
  // Shared, not local: the sort is also the order a review walks.
  const { sort, setSort } = useTriggers()
  const sorted = useMemo(() => sortTriggers(triggers, sort), [triggers, sort])

  const toggleSort = (key: SortKey) => {
    setSort(
      sort.key === key
        ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : // A new column starts ascending, the way the default reads:
          // oldest, lowest id, A first.
          { key, direction: 'asc' },
    )
  }

  // useNavigate's function is stable, so the memoised rows stay memoised.
  const open = useMemo(() => (id: number) => navigate(triggerPath(id)), [navigate])

  return (
    <Table.Root size="sm" interactive stickyHeader>
      <Table.Header>
        <Table.Row bg="bg.panel">
          {COLUMNS.map((column) => {
            const active = sort.key === column.key
            return (
              <Table.ColumnHeader
                key={column.key}
                textAlign={column.numeric ? 'end' : 'start'}
                whiteSpace="nowrap"
                aria-sort={
                  active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
              >
                <Box
                  asChild
                  display="inline-flex"
                  alignItems="center"
                  gap="1"
                  fontWeight="semibold"
                  cursor="pointer"
                  color={active ? 'fg' : 'fg.muted'}
                  _hover={{ color: 'fg' }}
                >
                  <button type="button" onClick={() => toggleSort(column.key)}>
                    {column.label}
                    {active &&
                      (sort.direction === 'asc' ? (
                        <LuArrowUp aria-hidden />
                      ) : (
                        <LuArrowDown aria-hidden />
                      ))}
                  </button>
                </Box>
              </Table.ColumnHeader>
            )
          })}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {sorted.map((trigger) => (
          <TriggerRow key={trigger.id} trigger={trigger} onOpen={open} />
        ))}
      </Table.Body>
    </Table.Root>
  )
}
