import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

// GET /api/chats/[chatId] — load chat with messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await params;

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ chat });
  } catch (error: any) {
    console.error('Get chat error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat', details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/chats/[chatId] — update title or sessionId
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await params;
    const body = await req.json();

    const chat = await prisma.chat.updateMany({
      where: { id: chatId, userId },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.sessionId !== undefined && { sessionId: body.sessionId }),
      },
    });

    if (chat.count === 0) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update chat error:', error);
    return NextResponse.json(
      { error: 'Failed to update chat', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/chats/[chatId] — delete chat and all messages
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chatId } = await params;

    // Verify ownership first
    const existing = await prisma.chat.findFirst({
      where: { id: chatId, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    await prisma.chat.delete({ where: { id: chatId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete chat error:', error);
    return NextResponse.json(
      { error: 'Failed to delete chat', details: error.message },
      { status: 500 }
    );
  }
}
