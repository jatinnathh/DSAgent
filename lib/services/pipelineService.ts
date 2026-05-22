// lib/services/pipelineService.ts — Business logic for Pipeline operations
import { pipelineRepository } from '../repositories/pipelineRepository';
import logger from '../logger';

export const pipelineService = {
  /** List user's pipelines */
  async listPipelines(userId: string) {
    return pipelineRepository.findByUserId(userId);
  },

  /** Get a single pipeline */
  async getPipeline(pipelineId: string, userId: string) {
    return pipelineRepository.findById(pipelineId, userId);
  },

  /** Create a new pipeline */
  async createPipeline(userId: string, name?: string, sessionId?: string, metadata?: unknown) {
    const pipeline = await pipelineRepository.create(userId, name, sessionId, metadata);
    logger.info('Pipeline created', { userId, pipelineId: pipeline.id });
    return pipeline;
  },

  /** Update pipeline status */
  async updateStatus(pipelineId: string, status: string) {
    return pipelineRepository.updateStatus(pipelineId, status);
  },

  /** Delete a pipeline */
  async deletePipeline(pipelineId: string, userId: string) {
    const result = await pipelineRepository.delete(pipelineId, userId);
    logger.info('Pipeline deleted', { userId, pipelineId });
    return result;
  },
};
