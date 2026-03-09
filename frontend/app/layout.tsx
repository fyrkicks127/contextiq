import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ContextIQ - Smart Context, Zero Waste',
  description: 'AI Developer Productivity Middleware',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}