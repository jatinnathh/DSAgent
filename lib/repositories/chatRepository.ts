// lib/repositories/chatRepository.ts — Data access layer for Chat model
import prisma from '../prisma';

export const chatRepository = {
  /** List user's chats with message count */
  async findByUserId(userId: string) {
    return prisma.chat.findMany({
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
  },

  /** Get a single chat with messages */
  async findByIdWithMessages(chatId: string, userId: string) {
    return prisma.chat.findFirst({
      where: { id: chatId, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  },

  /** Create a new chat */
  async create(userId: string, title?: string, sessionId?: string) {
    return prisma.chat.create({
      data: {
        title: title || 'New Chat',
        userId,
        sessionId: sessionId || null,
      },
    });
  },

  /** Update chat title */
  async updateTitle(chatId: string, userId: string, title: string) {
    return prisma.chat.updateMany({
      where: { id: chatId, userId },
      data: { title },
    });
  },

  /** Delete a chat */
  async delete(chatId: string, userId: string) {
    return prisma.chat.deleteMany({
      where: { id: chatId, userId },
    });
  },

  /** Add a message to a chat */
  async addMessage(chatId: string, role: string, content: string) {
    return prisma.message.create({
      data: { chatId, role, content },
    });
  },

  /** Count total chats (admin) */
  async count() {
    return prisma.chat.count();
  },
};
