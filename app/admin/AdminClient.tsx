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
        <div className="card admin-card">
            <style>{`
        .admin-card { padding: 16px; }
        .admin-controls { display:flex; gap:8px; margin-bottom:12px; align-items:center }
        .admin-input { flex:1; padding:8px 10px; border:1px solid #ddd; border-radius:6px }
        .admin-small { padding:6px 10px; border-radius:6px }
        .admin-table { width:100%; border-collapse:collapse }
        .admin-table thead th { text-align:left; padding:8px; font-size:13px; color:#333 }
        .admin-table tbody tr { border-top:1px solid #eee }
        .admin-table td { padding:8px; vertical-align:top }
        .title-line { font-weight:600 }
        .url-line { color:#666; font-size:12px; margin-top:6px }
        .delete-btn { color:white; background:#ef4444; border:none; padding:6px 10px; border-radius:6px }
        .delete-btn[disabled] { opacity:0.6 }
        .id-cell code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Courier New', monospace; font-size:12px; color:#444 }
        .search-input { flex:1; padding:8px 10px; border:1px solid #eee; border-radius:6px }
        @media (max-width: 680px) {
          .admin-table thead { display:none }
          .admin-table, .admin-table tbody, .admin-table tr, .admin-table td { display:block; width:100% }
          .admin-table tr { margin-bottom:12px }
          .admin-table td { padding:8px 4px }
          .delete-btn { width:100% }
        }
      `}</style>

            <h2 style={{ marginTop: 0 }}>Admin</h2>
            <p style={{ marginTop: 0 }}>Delete links (authenticate with your <code>AUTH_KEY</code>).</p>

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
                                    <div className="title-line">{l.meta?.title || l.meta?.text || l.url || l.meta?.url}</div>
                                    <div className="url-line"><a href={l.meta?.url || l.url} target="_blank" rel="noopener noreferrer">{l.meta?.url || l.url}</a></div>
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
    );
}
