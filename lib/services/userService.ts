// lib/services/userService.ts — Business logic for User operations
import { userRepository } from '../repositories/userRepository';
import { recordLogin } from '../audit';
import logger from '../logger';

export const userService = {
  /** Handle user login/upsert and record audit */
  async handleLogin(clerkId: string, email: string, ip?: string, userAgent?: string) {
    const user = await userRepository.upsert(clerkId, email);
    recordLogin(clerkId, email, ip, userAgent);
    logger.info('User logged in', { userId: clerkId, email });
    return user;
  },

  /** Check if user is admin */
  isAdmin(email: string): boolean {
    return email === 'jatinnath1111@gmail.com';
  },

  /** Get user by Clerk ID */
  async getByClerkId(clerkId: string) {
    return userRepository.findByClerkId(clerkId);
  },

  /** Get all users with stats (admin) */
  async getAllWithStats(page?: number, limit?: number) {
    return userRepository.findAllWithCounts(page, limit);
  },

  /** Get detailed user activity (admin) */
  async getUserActivity(clerkId: string) {
    return userRepository.getUserActivity(clerkId);
  },
};
