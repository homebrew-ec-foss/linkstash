import { NextRequest, NextResponse } from 'next/server';
import { client, initDb } from '../../../../scripts/db';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    const { key } = await params;

    if (!key) {
        return NextResponse.json({ error: 'Missing content key' }, { status: 400 });
    }

    try {
        // Initialize database if needed
        await initDb();

        const result = await client.execute({
            sql: 'SELECT content FROM links WHERE id = ?',
            args: [key]
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        return new NextResponse(result.rows[0].content as string, {
            headers: { 'Content-Type': 'text/plain' }
        });
    } catch (error) {
        console.error('Error in content endpoint:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}