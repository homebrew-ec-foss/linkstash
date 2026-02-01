"use client";

import { useEffect, useState } from 'react';

export default function ServiceWorkerRegister() {
    const [registered, setRegistered] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        let reg: ServiceWorkerRegistration | null = null;

        navigator.serviceWorker.register('/sw.js').then((r) => {
            reg = r;
            setRegistered(true);

            // detect updates
            if (r.waiting) setUpdateAvailable(true);
            r.addEventListener('updatefound', () => {
                const newWorker = r.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        setUpdateAvailable(true);
                    }
                });
            });
        }).catch(() => {
            // ignore registration errors
        });

        const onControllerChange = () => {
            setUpdateAvailable(false);
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        return () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };
    }, []);

    function refreshAndReload() {
        if (!navigator.serviceWorker.controller) return window.location.reload();
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }

    if (!registered) return null;

    return (
        <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 9999 }}>
            {updateAvailable && (
                <div style={{ background: 'var(--card)', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.2)' }}>
                    <div style={{ marginBottom: 6 }}>Update available</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={refreshAndReload}>Reload</button>
                    </div>
                </div>
            )}
        </div>
    );
}
