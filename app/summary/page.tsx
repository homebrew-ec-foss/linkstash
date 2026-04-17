"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type SummaryItem = {
    id?: string;
    url?: string;
    title?: string;
    name?: string;
    domain?: string;
    roomComment?: string;
    ts?: number;
    count?: number;
    meta?: Record<string, any>;
};

type RoomStat = {
    name: string;
    total: number;
};

type SummaryResponse = {
    from: string | null;
    to: string | null;
    room: string | null;
    total: number;
    rooms: RoomStat[];
    summary: SummaryItem[];
};

function toIsoDay(d: Date) {
    return d.toISOString().slice(0, 10);
}

function formatRange(from: string | null, to: string | null) {
    if (!from || !to) return 'Latest activity';
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T00:00:00`);
    const fromLabel = fromDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const toLabel = toDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return from === to ? fromLabel : `${fromLabel} to ${toLabel}`;
}

function roomName(item: SummaryItem) {
    return (item.roomComment || '').trim() || 'Unknown';
}

function dayKeyFromTs(ts: number | undefined) {
    if (!ts) return '';
    return new Date(ts).toISOString().slice(0, 10);
}

function formatLongDay(day: string) {
    const d = new Date(`${day}T00:00:00Z`);
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function buildDayRange(from: string | null, to: string | null) {
    if (!from || !to) return [] as string[];
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const out: string[] = [];

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        out.push(d.toISOString().slice(0, 10));
    }

    return out;
}

export default function SummaryPage() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [room, setRoom] = useState('');
    const [query, setQuery] = useState('');
    const [selectedDay, setSelectedDay] = useState('');

    const [data, setData] = useState<SummaryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const initialFrom = params.get('from') || params.get('day') || '';
        const initialTo = params.get('to') || params.get('day') || '';
        const initialRoom = params.get('room') || '';
        setFrom(initialFrom);
        setTo(initialTo);
        setRoom(initialRoom);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                if (from) params.set('from', from);
                if (to) params.set('to', to);
                if (room) params.set('room', room);

                const search = params.toString();
                const url = `/api/summary${search ? `?${search}` : ''}`;
                const res = await fetch(url);
                if (!res.ok) {
                    setError(`Failed to load summary (${res.status})`);
                    return;
                }

                const payload = (await res.json()) as SummaryResponse;
                if (cancelled) return;
                setData(payload);

                if (!from && payload.from) {
                    setFrom(payload.from);
                }
                if (!to && payload.to) {
                    setTo(payload.to);
                }

                const queryParams = new URLSearchParams(window.location.search);
                if (from) queryParams.set('from', from); else queryParams.delete('from');
                if (to) queryParams.set('to', to); else queryParams.delete('to');
                queryParams.delete('day');
                if (room) queryParams.set('room', room); else queryParams.delete('room');
                const next = queryParams.toString();
                window.history.replaceState(null, '', `/summary${next ? `?${next}` : ''}`);
            } catch (e) {
                if (!cancelled) setError('Unable to load summary');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [from, to, room]);

    const filtered = useMemo(() => {
        const list = data?.summary || [];
        if (!query.trim()) return list;
        const q = query.trim().toLowerCase();
        return list.filter((item) => {
            const title = (item.title || item.name || item.meta?.title || '').toLowerCase();
            const domain = (item.domain || item.meta?.domain || '').toLowerCase();
            const url = (item.url || item.meta?.url || '').toLowerCase();
            const roomText = roomName(item).toLowerCase();
            return title.includes(q) || domain.includes(q) || url.includes(q) || roomText.includes(q);
        });
    }, [data, query]);

    const totalVotes = useMemo(
        () => filtered.reduce((acc, item) => acc + (item.count || 0), 0),
        [filtered]
    );

    const activeRoomLabel = room || 'All rooms';

    const rangeFrom = data?.from || from || null;
    const rangeTo = data?.to || to || null;

    const calendarDays = useMemo(() => buildDayRange(rangeFrom, rangeTo), [rangeFrom, rangeTo]);

    const countsByDay = useMemo(() => {
        const counts = new Map<string, number>();
        for (const item of filtered) {
            const day = dayKeyFromTs(item.ts);
            if (!day) continue;
            counts.set(day, (counts.get(day) || 0) + 1);
        }
        return counts;
    }, [filtered]);

    const maxDayCount = useMemo(() => {
        let max = 0;
        for (const value of countsByDay.values()) {
            if (value > max) max = value;
        }
        return max || 1;
    }, [countsByDay]);

    useEffect(() => {
        const populatedDays = Array.from(countsByDay.keys()).sort((a, b) => a.localeCompare(b));
        if (populatedDays.length === 0) {
            setSelectedDay('');
            return;
        }
        if (!selectedDay || !countsByDay.has(selectedDay)) {
            setSelectedDay(populatedDays[populatedDays.length - 1]);
        }
    }, [countsByDay, selectedDay]);

    const selectedDayLinks = useMemo(() => {
        if (!selectedDay) return filtered;
        return filtered.filter((item) => dayKeyFromTs(item.ts) === selectedDay);
    }, [filtered, selectedDay]);

    const calendarOffset = useMemo(() => {
        if (calendarDays.length === 0) return 0;
        return new Date(`${calendarDays[0]}T00:00:00Z`).getUTCDay();
    }, [calendarDays]);

    return (
        <main className="app-main">
            <div className="container" role="main">
                <div className="card summary-card">
                    <div className="summary-topbar">
                        <div>
                            <div className="summary-kicker">Timeline Mode</div>
                            <h1 className="summary-title">Link Calendar</h1>
                            <div className="summary-subtitle">{formatRange(data?.from || from || null, data?.to || to || null)}</div>
                        </div>
                        <Link href="/" className="summary-home-link">Back to feed</Link>
                    </div>

                    <div className="summary-controls">
                        <div className="summary-control">
                            <label htmlFor="summary-from">From</label>
                            <input
                                id="summary-from"
                                type="date"
                                value={from}
                                max={toIsoDay(new Date())}
                                onChange={(e) => setFrom(e.target.value)}
                            />
                        </div>
                        <div className="summary-control">
                            <label htmlFor="summary-to">To</label>
                            <input
                                id="summary-to"
                                type="date"
                                value={to}
                                min={from || undefined}
                                max={toIsoDay(new Date())}
                                onChange={(e) => setTo(e.target.value)}
                            />
                        </div>
                        <div className="summary-control summary-control-search">
                            <label htmlFor="summary-q">Search</label>
                            <input
                                id="summary-q"
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Title, domain, URL, room"
                            />
                        </div>
                    </div>

                    <div className="summary-chip-row" role="tablist" aria-label="Room filters">
                        <button
                            type="button"
                            className={`summary-chip ${room === '' ? 'active' : ''}`}
                            onClick={() => setRoom('')}
                        >
                            All rooms
                        </button>
                        {(data?.rooms || []).map((roomItem) => (
                            <button
                                type="button"
                                key={roomItem.name}
                                className={`summary-chip ${roomItem.name === room ? 'active' : ''}`}
                                onClick={() => setRoom(roomItem.name === 'Unknown' ? 'Unknown' : roomItem.name)}
                            >
                                {roomItem.name}
                                <span>{roomItem.total}</span>
                            </button>
                        ))}
                    </div>

                    <div className="summary-stats">
                        <div>
                            <strong>{filtered.length}</strong>
                            <span>links shown</span>
                        </div>
                        <div>
                            <strong>{totalVotes}</strong>
                            <span>total votes</span>
                        </div>
                        <div>
                            <strong>{activeRoomLabel}</strong>
                            <span>active room filter</span>
                        </div>
                    </div>

                    <div className="summary-calendar-card">
                        <div className="summary-calendar-head">
                            <h2>Calendar view</h2>
                            <span>{selectedDay ? formatLongDay(selectedDay) : 'Select a day with activity'}</span>
                        </div>

                        <div className="summary-weekdays" aria-hidden="true">
                            <span>Sun</span>
                            <span>Mon</span>
                            <span>Tue</span>
                            <span>Wed</span>
                            <span>Thu</span>
                            <span>Fri</span>
                            <span>Sat</span>
                        </div>

                        <div className="summary-calendar-grid">
                            {Array.from({ length: calendarOffset }).map((_, idx) => (
                                <div key={`empty-${idx}`} className="summary-day-empty" />
                            ))}

                            {calendarDays.map((day) => {
                                const count = countsByDay.get(day) || 0;
                                const intensity = count === 0
                                    ? 0
                                    : count >= maxDayCount * 0.8
                                        ? 4
                                        : count >= maxDayCount * 0.55
                                            ? 3
                                            : count >= maxDayCount * 0.3
                                                ? 2
                                                : 1;

                                return (
                                    <button
                                        type="button"
                                        key={day}
                                        className={`summary-day-cell level-${intensity} ${selectedDay === day ? 'active' : ''}`}
                                        onClick={() => setSelectedDay(day)}
                                        title={`${day}: ${count} links`}
                                    >
                                        <span className="summary-day-num">{new Date(`${day}T00:00:00Z`).getUTCDate()}</span>
                                        <span className="summary-day-count">{count > 0 ? count : ''}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <ol className="link-list">
                        {loading ? (
                            <li className="summary-empty">Loading summary...</li>
                        ) : error ? (
                            <li className="summary-empty">{error}</li>
                        ) : selectedDayLinks.length === 0 ? (
                            <li className="summary-empty">No links match this filter.</li>
                        ) : (
                            selectedDayLinks.map((item, idx) => {
                                const url = item.url || item.meta?.url || '#';
                                const title = item.title || item.name || item.meta?.title || url;
                                const domain = item.domain || item.meta?.domain || (() => {
                                    try {
                                        return new URL(url).hostname;
                                    } catch (e) {
                                        return '';
                                    }
                                })();
                                return (
                                    <li key={item.id || `${url}-${idx}`}>
                                        <div className="rank">{idx + 1}.</div>
                                        <div className="link-main">
                                            <a href={url} target="_blank" rel="noopener noreferrer" className="link-title">{title}</a>
                                            <div className="link-domain">
                                                {domain}
                                                {` - ${roomName(item)}`}
                                            </div>
                                        </div>
                                        <div className="votes">{item.count ? `${item.count} votes` : ''}</div>
                                    </li>
                                );
                            })
                        )}
                    </ol>
                </div>
            </div>
        </main>
    );
}
