import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Freshco — Dashboard WhatsApp',
  description: 'Dashboard de conversaciones WhatsApp para Freshco',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
