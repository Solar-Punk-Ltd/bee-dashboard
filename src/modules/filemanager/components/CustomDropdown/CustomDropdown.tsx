import { useState, useRef } from 'react'
import './CustomDropdown.scss'
import ArrowDropdown from 'remixicon-react/ArrowDropDownLineIcon'
import { useClickOutside } from '../../hooks/useClickOutside'
import { Tooltip } from '../Tooltip/Tooltip'

interface Option {
  value: number
  label: string
}

interface CustomDropdownProps {
  options: Option[]
  value: number
  onChange: (value: number) => void
  placeholder?: string
  id?: string
  label?: string
  icon?: React.ReactNode
  infoText?: string
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder,
  id,
  label,
  icon,
  infoText,
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, () => setOpen(false), open)

  const selectedLabel = options.find(opt => opt.value === value)?.label || ''

  return (
    <div className="fm-custom-dropdown" ref={ref}>
      {label && (
        <label htmlFor={id} className="fm-dropdown-label">
          {icon} {label} {infoText && <Tooltip label={infoText ? infoText : ''} iconSize="14px" />}
        </label>
      )}
      <div
        className={`fm-custom-dropdown-selected${open ? ' open' : ''}`}
        id={id}
        onClick={() => setOpen(prev => !prev)}
      >
        {selectedLabel || <span className="placeholder">{placeholder} </span>}

        <ArrowDropdown className="arrow" />
      </div>
      {open && (
        <ul className="fm-custom-dropdown-list">
          {options.map(opt => (
            <li
              key={opt.value}
              className={opt.value === value ? 'selected' : ''}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
