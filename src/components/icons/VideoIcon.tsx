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
}

const VideoIcon = ({ color }: Props): ReactElement => {
  const classes = useStyles()

  return (
    <div className={classes.container}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g clipPath="url(#clip0_3762_7531)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M4 3C3.46957 3 2.96086 3.21071 2.58579 3.58579C2.21071 3.96086 2 4.46957 2 5V19C2 19.5304 2.21071 20.0391 2.58579 20.4142C2.96086 20.7893 3.46957 21 4 21H20C20.5304 21 21.0391 20.7893 21.4142 20.4142C21.7893 20.0391 22 19.5304 22 19V5C22 4.46957 21.7893 3.96086 21.4142 3.58579C21.0391 3.21071 20.5304 3 20 3H4ZM8.625 8.63C8.64719 8.43882 8.71376 8.25547 8.81939 8.09458C8.92502 7.93369 9.0668 7.79972 9.2334 7.70335C9.4 7.60698 9.58682 7.55089 9.77896 7.53954C9.97109 7.5282 10.1632 7.56191 10.34 7.638C10.844 7.854 11.908 8.34 13.256 9.118C14.2034 9.65944 15.1182 10.2558 15.996 10.904C16.1503 11.0188 16.2757 11.1682 16.362 11.34C16.4484 11.5119 16.4933 11.7016 16.4933 11.894C16.4933 12.0864 16.4484 12.2761 16.362 12.448C16.2757 12.6198 16.1503 12.7692 15.996 12.884C15.1182 13.5315 14.2033 14.1272 13.256 14.668C12.3137 15.2184 11.34 15.7132 10.34 16.15C10.1632 16.2263 9.97106 16.2602 9.77885 16.2489C9.58664 16.2377 9.39973 16.1816 9.23306 16.0852C9.0664 15.9888 8.9246 15.8548 8.81902 15.6938C8.71344 15.5328 8.64699 15.3493 8.625 15.158C8.50501 14.0742 8.44625 12.9844 8.449 11.894C8.449 10.343 8.561 9.175 8.625 8.63Z"
            fill={color ? color : '#333333'}
          />
        </g>
        <defs>
          <clipPath id="clip0_3762_7531">
            <rect width="24" height="24" fill="white" />
          </clipPath>
        </defs>
      </svg>
    </div>
  )
}

export default VideoIcon
