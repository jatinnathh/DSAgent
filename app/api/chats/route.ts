import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

// GET /api/chats — list user's chats
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const chats = await prisma.chat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        sessionId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({ chats });
  } catch (error: any) {
    console.error('List chats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chats', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/chats — create new chat
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { title, sessionId } = body;

    const chat = await prisma.chat.create({
      data: {
        title: title || 'New Chat',
        userId,
        sessionId: sessionId || null,
      },
    });

    return NextResponse.json({ chat });
  } catch (error: any) {
    console.error('Create chat error:', error);
    return NextResponse.json(
      { error: 'Failed to create chat', details: error.message },
      { status: 500 }
    );
  }
}
