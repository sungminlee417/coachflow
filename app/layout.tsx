import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ToastContainer from '@/components/ui/Toast'
import { ServiceWorkerRegister } from '@/components/ui/ServiceWorkerRegister'
import { OfflineBanner } from '@/components/ui/OfflineBanner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'CoachFlow - Fitness Coaching Platform',
    template: '%s | CoachFlow',
  },
  description: 'Coach others, get coached, or both - all in one place.',
  metadataBase: new URL('https://coachflow.app'),
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CoachFlow',
  },
  openGraph: {
    title: 'CoachFlow - Fitness Coaching Platform',
    description: 'Coach others, get coached, or both - all in one place.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <OfflineBanner />
        {children}
        <ToastContainer />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
