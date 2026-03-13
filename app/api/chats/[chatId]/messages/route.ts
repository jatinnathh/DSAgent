import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import prisma from '@/lib/prisma';

// POST /api/chats/[chatId]/messages — save a message
export async function POST(
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
    const { role, content } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: 'role and content are required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const message = await prisma.message.create({
      data: { chatId, role, content },
    });

    // Update chat timestamp
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error('Save message error:', error);
    return NextResponse.json(
      { error: 'Failed to save message', details: error.message },
      { status: 500 }
    );
  }
}
