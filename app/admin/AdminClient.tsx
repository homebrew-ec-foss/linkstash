"use client";

import React, { useEffect, useState, useMemo } from 'react';

type LinkItem = any;

export default function AdminClient() {
    const [links, setLinks] = useState<LinkItem[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [authKey, setAuthKey] = useState<string>("" as string);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<Record<string, boolean>>({});
    const [search, setSearch] = useState<string>('');

    useEffect(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('admin_auth') : null;
        if (stored) setAuthKey(stored);
        fetchLinks();
    }, []);

    async function fetchLinks() {
        setLoading(true);
        try {
            const res = await fetch('/api/links');
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setLinks(data || []);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Error fetching links');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this link?')) return;
        if (!authKey) {
            alert('Enter the AUTH_KEY before deleting');
            return;
        }

        setDeleting((s) => ({ ...s, [id]: true }));
        try {
            const res = await fetch('/api/admin/link', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authKey}`,
                },
                body: JSON.stringify({ id }),
            });
            const json = await res.json();
            if (!res.ok) {
                alert(json.error || 'Delete failed');
                return;
            }
            // success: remove locally without refetch
            setLinks((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
        } catch (e: any) {
            alert(e.message || 'Delete request failed');
        } finally {
            setDeleting((s) => ({ ...s, [id]: false }));
        }
    }

    function saveAuth() {
        localStorage.setItem('admin_auth', authKey);
        alert('Auth key saved to localStorage');
    }

    const filtered = useMemo(() => {
        if (!links) return [];
        const q = search.trim().toLowerCase();
        if (!q) return links;
        return links.filter((l: any) => {
            const t = (l.meta?.title || '') + ' ' + (l.meta?.url || l.url || '') + ' ' + (l.id || '');
            return t.toLowerCase().includes(q);
        });
    }, [links, search]);

    const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id);

    return (
        <div className="container">
            <div className="card admin">

                <h2>Admin</h2>
                <p>Delete links (authenticate with your <code>AUTH_KEY</code>).</p>
                <div className="admin-controls">
                    <input
                        className="admin-input"
                        value={authKey}
                        onChange={(e) => setAuthKey(e.target.value)}
                        placeholder="AUTH_KEY"
                        aria-label="AUTH_KEY"
                    />
                    <button className="admin-small" onClick={saveAuth}>Save</button>
                    <button className="admin-small" onClick={() => { setAuthKey(''); localStorage.removeItem('admin_auth'); }}>Clear</button>
                    <input className="search-input" placeholder="Search title, url, or id" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>

                {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}

                {loading ? (
                    <div>Loading links…</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th style={{ width: 240 }}>ID</th>
                                <th>Title / URL</th>
                                <th style={{ width: 120 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {(filtered || []).map((l: any) => (
                                <tr key={l.id}>
                                    <td className="id-cell" style={{ width: 240 }} title={l.id}><code>{shortId(l.id)}</code></td>
                                    <td>
                                        <div className="title-line">{l.meta?.title || l.meta?.text || l.meta?.url || l.url}</div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="delete-btn" disabled={Boolean(deleting[l.id])} onClick={() => handleDelete(l.id)}>
                                            {deleting[l.id] ? 'Deleting…' : 'Delete'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div style={{ marginTop: 12 }}>
                    <button onClick={fetchLinks}>Refresh</button>
                </div>
            </div>
        </div>
    );
}
