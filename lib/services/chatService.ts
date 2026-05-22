// lib/services/chatService.ts — Business logic for Chat operations
import { chatRepository } from '../repositories/chatRepository';
import logger from '../logger';

export const chatService = {
  /** List user's chats */
  async listChats(userId: string) {
    return chatRepository.findByUserId(userId);
  },

  /** Get chat with messages */
  async getChatWithMessages(chatId: string, userId: string) {
    return chatRepository.findByIdWithMessages(chatId, userId);
  },

  /** Create a new chat */
  async createChat(userId: string, title?: string, sessionId?: string) {
    const chat = await chatRepository.create(userId, title, sessionId);
    logger.info('Chat created', { userId, chatId: chat.id });
    return chat;
  },

  /** Update chat title */
  async updateTitle(chatId: string, userId: string, title: string) {
    return chatRepository.updateTitle(chatId, userId, title);
  },

  /** Delete a chat */
  async deleteChat(chatId: string, userId: string) {
    const result = await chatRepository.delete(chatId, userId);
    logger.info('Chat deleted', { userId, chatId });
    return result;
  },

  /** Add a message */
  async addMessage(chatId: string, role: string, content: string) {
    return chatRepository.addMessage(chatId, role, content);
  },
};
