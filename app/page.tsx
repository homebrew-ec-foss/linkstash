import React from 'react'
import { getLinks } from '../scripts/db'

export const dynamic = 'force-dynamic'

export default async function Home() {
    // Server-side: call DB helper directly (avoid relative fetch in Node)
    const links = await getLinks();
    links.sort((a: any, b: any) => (b.count || 0) - (a.count || 0) || (b.ts || 0) - (a.ts || 0));

    const now = new Date().toLocaleString();

    return (
        <main className="app-main">
            <div className="topbar">
                <div className="container">
                    <div className="brand">HSP-Linkstash</div>
                    <div className="status">API Status: <span className="font-semibold">OK</span> — {now}</div>
                </div>
            </div>

            <div className="container" role="main">
                <div className="card">
                    <ol className="link-list">
                        {links.map((l: any, idx: number) => {
                            const url = l.url || (l.meta && l.meta.url) || ''
                            const title = l.title || l.name || (l.meta && l.meta.title) || url || 'Untitled'
                            let domain = l.domain || (l.meta && l.meta.domain) || ''
                            if (!domain && url) { try { domain = new URL(url).hostname } catch (e) { domain = '' } }

                            return (
                                <li key={l.id || url || idx} className="link-item">
                                    <div className="rank">{idx + 1}.</div>

                                    <div className="link-main">
                                        <a href={url || '#'} target="_blank" rel="noopener noreferrer" className="link-title">{title}</a>
                                        <div className="link-domain">{domain}</div>
                                    </div>

                                    <div className="votes">{l.count ? `${l.count} votes` : ''}</div>
                                </li>
                            )
                        })}

                        {links.length === 0 && (
                            <li className="p-6 text-center text-gray-500">No links found.</li>
                        )}
                    </ol>
                </div>
            </div>
        </main>
    )
}