import { NextResponse } from 'next/server'
import { deleteLinkById } from '../../../../scripts/db'

export async function DELETE(req: Request) {
    // Check authorization header
    const authHeader = req.headers.get('authorization') || ''
    const key = process.env.AUTH_KEY || ''
    if (!authHeader || authHeader !== `Bearer ${key}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json().catch(() => ({})) as { id?: string }
        const { id } = body
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const ok = await deleteLinkById(id)
        if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })

        return NextResponse.json({ ok: true })
    } catch (e) {
        console.error('admin delete error', e)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
