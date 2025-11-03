import { ReactElement } from 'react'
import InfoIcon from 'remixicon-react/InformationLineIcon'
import './Tooltip.scss'

interface TooltipProps {
  label: string
  iconSize?: string
}

export function Tooltip({ label, iconSize = '16px' }: TooltipProps): ReactElement {
  return (
    <span className="fm-tooltip-wrapper" aria-label="info tooltip">
      <span className="fm-tooltip-trigger" role="button" tabIndex={0}>
        <InfoIcon size={iconSize} />
      </span>
      <span
        className="fm-tooltip-container"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </span>
  )
}
