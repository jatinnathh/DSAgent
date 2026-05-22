// Refactored: app/api/chats/route.ts — Using service layer + api handler wrapper
import { NextRequest } from 'next/server';
import { createApiHandler } from '@/lib/api-handler';
import { chatService } from '@/lib/services/chatService';

// GET /api/chats — list user's chats
export const GET = createApiHandler(
  async (_req, ctx) => {
    const chats = await chatService.listChats(ctx.userId);
    return { chats };
  },
  { action: 'chats.list', resource: 'chats' }
);

// POST /api/chats — create new chat
export const POST = createApiHandler(
  async (req, ctx) => {
    const body = await req.json();
    const { title, sessionId } = body;
    const chat = await chatService.createChat(ctx.userId, title, sessionId);
    return { chat };
  },
  { action: 'chats.create', resource: 'chats' }
);
