import type { Metadata } from 'next'
import '../styles/globals.css'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'

export const metadata: Metadata = {
    title: 'HSP Linkstash',
    description: 'linkstash is a small experiment for collecting and sharing interesting links and articles you find during the week',
    metadataBase: new URL('https://linkstash.hsp-ec.xyz'),
    icons: {
        icon: '/favicon.png',
        shortcut: '/favicon.png',
        apple: '/favicon.png',
    },
    openGraph: {
        title: 'HSP Linkstash',
        description: 'linkstash is a small experiment for collecting and sharing interesting links and articles you find during the week',
        url: 'https://linkstash.hsp-ec.xyz',
        siteName: 'linkstash',
        images: ['/linkstash-preview.png'],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'HSP Linkstash',
        description: 'linkstash is a small experiment for collecting and sharing interesting links and articles you find during the week',
        images: ['/linkstash-preview.png'],
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet" />
                <link rel="icon" href="/favicon.png" />
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#0f172a" />
            </head>
            <body>
                {children}
                <ServiceWorkerRegister />
                <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs => { if (!regs || regs.length === 0) navigator.serviceWorker.register('/sw.js').catch(()=>{}); });` }} />
            </body>
        </html>
    )
} 