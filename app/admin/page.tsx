import AdminClient from './AdminClient'

export default function AdminPage() {
    return (
        <main style={{ padding: 20 }}>
            <h1>Admin</h1>
            <p style={{ marginTop: 0 }}>Delete links (authenticate with your <code>AUTH_KEY</code>).</p>
            <AdminClient />
        </main>
    )
}
