import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ToastContainer from '@/components/ui/Toast'
import { ServiceWorkerRegister } from '@/components/ui/ServiceWorkerRegister'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { QueryProviders } from '@/lib/query-client'
import { ThemeProvider } from '@/lib/theme'

const inter = Inter({ subsets: ['latin'] })

/** Inline bootstrap that flips <html> to `.dark` BEFORE React mounts.
 *  Without this the page paints in light, then React hydrates and the
 *  dark class lands one frame later — a visible flash for dark-mode
 *  users. The script reads the same localStorage key + system pref
 *  the ThemeProvider does, so they stay in lock-step.
 *
 *  Has to be a string literal in `dangerouslySetInnerHTML` because
 *  inline `<script>{...}</script>` is treated as a serialized JSX
 *  expression. Wrapped in try/catch so a storage failure (private
 *  browsing, disabled storage) doesn't break the page. */
const themeBootstrap = `
(function() {
  try {
    var pref = localStorage.getItem('coachflow-theme');
    if (pref !== 'light' && pref !== 'dark' && pref !== 'system') {
      pref = 'system';
    }
    var resolved = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`.trim()

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProviders>
            <OfflineBanner />
            {children}
            <ToastContainer />
            <ServiceWorkerRegister />
          </QueryProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
