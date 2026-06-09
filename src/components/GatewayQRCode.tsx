import { QRCodeSVG } from 'qrcode.react'
import { Box } from '@mui/material'

interface GatewayQRCodeProps {
  value: string
}

export const GatewayQRCode = ({ value }: GatewayQRCodeProps) => {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
        bgcolor: '#ffffff',
        borderRadius: 2,
      }}
    >
      <QRCodeSVG
        value={value}
        size={150}
        bgColor="#ffffff"
        fgColor="#000000"
        level="M"
      />
    </Box>
  )
}