import { ReactElement, useContext } from 'react'
import { SwarmSelect } from '../../components/SwarmSelect'
import { Context, EnrichedPostageBatch } from '../../providers/Stamps'

interface Props {
  onSelect: (stamp: EnrichedPostageBatch) => void
  defaultValue?: string
}

export function PostageStampSelector({ onSelect, defaultValue }: Props): ReactElement {
  const { stamps } = useContext(Context)

  function onChange(stampId: string) {
    if (!stamps) {
      return
    }
    const stamp = stamps.find(x => x.batchID.toHex() === stampId)

    if (stamp) {
      onSelect(stamp)
    }
  }

  return (
    <SwarmSelect
      options={(stamps || []).map(x => ({
        label: x.label ? x.batchID.toHex().slice(0, 8) + ' - ' + x.label : x.batchID.toHex().slice(0, 8),
        value: x.batchID.toHex(),
      }))}
      onChange={event => onChange(event.target.value as string)}
      defaultValue={defaultValue}
      placeholder="Please select a postage stamp..."
    />
  )
}
