/* oxlint-disable react/only-export-components */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { Providers } from './providers'

// Next.js reads this object to populate <title> and meta description tags.
// The export is part of the app-router API, which is why this file has a small
// oxlint exception above.
export const metadata: Metadata = {
  title: 'gRPC Command Console',
  description: 'A Next.js, MUI, Buf, and ConnectRPC command console.',
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        {/* Providers wraps every route so MUI theme values work everywhere. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
