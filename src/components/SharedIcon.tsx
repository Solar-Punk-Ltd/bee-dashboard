import { createStyles, makeStyles } from '@material-ui/core'
import type { ReactElement } from 'react'

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      display: 'flex',
    },
  }),
)

interface Props {
  color?: string
  size?: number
  sharedBy?: 'me' | 'others'
}

const EditIcon = (props: Props): ReactElement => {
  const classes = useStyles()

  return (
    <div className={classes.container}>
      {props.sharedBy === 'me' && (
        <svg width="17" height="15" viewBox="0 0 17 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3.5 7.15429C3.5 6.60201 3.94772 6.15429 4.5 6.15429L12.9535 6.15429L12.6657 5.88709C12.261 5.51128 12.2376 4.87855 12.6134 4.47384C12.9892 4.06913 13.6219 4.0457 14.0266 4.4215L16.1805 6.4215C16.3842 6.61071 16.5 6.87622 16.5 7.15429C16.5 7.43236 16.3842 7.69787 16.1805 7.88709L14.0266 9.88709C13.6219 10.2629 12.9892 10.2395 12.6134 9.83474C12.2376 9.43003 12.261 8.7973 12.6657 8.4215L12.9535 8.15429H4.5C3.94772 8.15429 3.5 7.70658 3.5 7.15429Z"
            fill={props.color ? props.color : '#DE7700'}
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M6.19594 14.3086L-0.00021553 10.7312L-0.00021553 3.57654L6.19594 -0.000806808L11.0261 2.78787C11.5044 3.06401 11.6682 3.6756 11.3921 4.15389C11.1159 4.63219 10.5044 4.79606 10.0261 4.51992L6.19594 2.30859L1.99978 4.73124L1.99978 9.57654L6.19594 11.9992L10.0261 9.78787C10.5044 9.51173 11.1159 9.6756 11.3921 10.1539C11.6682 10.6322 11.5044 11.2438 11.0261 11.5199L6.19594 14.3086Z"
            fill={props.color ? props.color : '#DE7700'}
          />
        </svg>
      )}
      {props.sharedBy === 'others' && (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M0 7.15429C0 6.60201 0.447715 6.15429 1 6.15429L7.45346 6.15429L7.1657 5.88709C6.76099 5.51128 6.73756 4.87855 7.11336 4.47384C7.48916 4.06913 8.12189 4.0457 8.5266 4.4215L10.6805 6.4215C10.8842 6.61071 11 6.87622 11 7.15429C11 7.43236 10.8842 7.69787 10.6805 7.88709L8.5266 9.88709C8.12189 10.2629 7.48916 10.2395 7.11336 9.83474C6.73756 9.43003 6.76099 8.7973 7.1657 8.4215L7.45346 8.15429H1C0.447715 8.15429 0 7.70658 0 7.15429Z"
            fill={props.color ? props.color : '#333333'}
          />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.19615 0L14.3923 3.57735V10.7321L8.19615 14.3094L3.36603 11.5207C2.88773 11.2446 2.72386 10.633 3 10.1547C3.27614 9.67641 3.88773 9.51253 4.36602 9.78867L8.19615 12L12.3923 9.57735V4.73205L8.19615 2.3094L4.36603 4.52073C3.88773 4.79687 3.27614 4.63299 3 4.1547C2.72386 3.67641 2.88773 3.06482 3.36603 2.78867L8.19615 0Z"
            fill={props.color ? props.color : '#333333'}
          />
        </svg>
      )}
    </div>
  )
}

export default EditIcon
