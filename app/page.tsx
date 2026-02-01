import LinksClient from './components/LinksClient'

export const dynamic = 'force-dynamic'

export default async function Home() {
    return (
        <main className="app-main">
            <div className="container" role="main">
                <LinksClient />
            </div>
        </main>
    )
} 