import LinksClient from './components/LinksClient'

export const dynamic = 'force-dynamic'

export default async function Home() {
    return (
        <main className="app-main">
            <div className="topbar">
                <div className="container">
                    <div className="brand">HSP-Linkstash</div>
                </div>
            </div>

            <div className="container" role="main">
                <LinksClient />
            </div>
        </main>
    )
}