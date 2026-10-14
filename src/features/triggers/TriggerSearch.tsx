import { CloseButton, Input, InputGroup } from '@chakra-ui/react'
import { LuSearch } from 'react-icons/lu'

export function TriggerSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <InputGroup
      maxW={{ base: 'full', sm: '18rem' }}
      startElement={<LuSearch aria-hidden />}
      endElement={
        value ? (
          <CloseButton
            size="xs"
            variant="plain"
            aria-label="Clear the filter"
            onClick={() => onChange('')}
            // Escape does the same job from the keyboard.
            tabIndex={-1}
          />
        ) : undefined
      }
    >
      <Input
        // Not inside a Field.Root, so it needs its own id and name.
        id="trigger-filter"
        name="trigger-filter"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            onChange('')
          }
        }}
        placeholder="Filter by trigger ID"
        aria-label="Filter triggers by identifier"
        // Not inputMode="numeric": the box also takes ^ and $ to anchor a
        // search, and a numeric keypad would hide them on a phone.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        size="sm"
      />
    </InputGroup>
  )
}
