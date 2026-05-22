// lib/elasticsearch.ts — Elasticsearch client with circuit breaker and fallback
// Uses database-backed search as fallback when ES is unavailable
import { elasticsearchCircuitBreaker } from './circuit-breaker';
import { auditRepository } from './repositories/auditRepository';
import logger from './logger';

interface ElasticsearchConfig {
  node: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

interface SearchResult {
  hits: Array<{
    id: string;
    score: number;
    source: Record<string, unknown>;
  }>;
  total: number;
  took: number;
}

// ============================================
// Elasticsearch Client (Lazy Init)
// ============================================

let esClient: any = null;
let esAvailable = false;

async function getElasticsearchClient() {
  if (esClient) return esClient;

  const esNode = process.env.ELASTICSEARCH_URL;
  if (!esNode) {
    logger.debug('Elasticsearch not configured — using database fallback');
    return null;
  }

  try {
    const { Client } = await import('@elastic/elasticsearch');
    esClient = new Client({
      node: esNode,
      auth: process.env.ELASTICSEARCH_API_KEY
        ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
        : process.env.ELASTICSEARCH_USERNAME
        ? { username: process.env.ELASTICSEARCH_USERNAME, password: process.env.ELASTICSEARCH_PASSWORD || '' }
        : undefined,
    });

    // Test connection
    await esClient.ping();
    esAvailable = true;
    logger.info('Elasticsearch connected', { node: esNode });
    return esClient;
  } catch (error) {
    logger.warn('Elasticsearch unavailable — using database fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    esAvailable = false;
    return null;
  }
}

// ============================================
// Index Management
// ============================================

const AUDIT_INDEX = 'dsagent-audit-logs';

async function ensureIndex() {
  const client = await getElasticsearchClient();
  if (!client) return;

  try {
    const exists = await client.indices.exists({ index: AUDIT_INDEX });
    if (!exists) {
      await client.indices.create({
        index: AUDIT_INDEX,
        body: {
          mappings: {
            properties: {
              userId: { type: 'keyword' },
              userEmail: { type: 'keyword' },
              action: { type: 'keyword' },
              resource: { type: 'keyword' },
              method: { type: 'keyword' },
              path: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              statusCode: { type: 'integer' },
              duration: { type: 'integer' },
              ip: { type: 'ip' },
              userAgent: { type: 'text' },
              errorMessage: { type: 'text' },
              requestId: { type: 'keyword' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      logger.info(`Created Elasticsearch index: ${AUDIT_INDEX}`);
    }
  } catch (error) {
    logger.error('Failed to ensure ES index', { error: String(error) });
  }
}

// ============================================
// Public API
// ============================================

/**
 * Index an audit log entry in Elasticsearch
 */
export async function indexAuditLog(entry: Record<string, unknown>): Promise<void> {
  if (!esAvailable) return;

  try {
    await elasticsearchCircuitBreaker.execute(async () => {
      const client = await getElasticsearchClient();
      if (!client) return;

      await client.index({
        index: AUDIT_INDEX,
        body: {
          ...entry,
          createdAt: new Date().toISOString(),
        },
      });
    });
  } catch (error) {
    logger.debug('ES indexing skipped', { error: String(error) });
  }
}

/**
 * Search audit logs — uses ES if available, falls back to database
 */
export async function searchAuditLogs(query: string, filters: {
  userId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ logs: unknown[]; total: number; source: string }> {
  const { page = 1, limit = 50 } = filters;

  // Try Elasticsearch first
  if (esAvailable) {
    try {
      return await elasticsearchCircuitBreaker.execute(async () => {
        const client = await getElasticsearchClient();
        if (!client) throw new Error('ES client unavailable');

        const must: unknown[] = [];

        if (query) {
          must.push({
            multi_match: {
              query,
              fields: ['action', 'path', 'userEmail', 'errorMessage', 'requestId'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          });
        }

        if (filters.userId) must.push({ term: { userId: filters.userId } });
        if (filters.action) must.push({ term: { action: filters.action } });
        if (filters.startDate || filters.endDate) {
          must.push({
            range: {
              createdAt: {
                ...(filters.startDate ? { gte: filters.startDate } : {}),
                ...(filters.endDate ? { lte: filters.endDate } : {}),
              },
            },
          });
        }

        const result = await client.search({
          index: AUDIT_INDEX,
          body: {
            query: { bool: { must: must.length > 0 ? must : [{ match_all: {} }] } },
            from: (page - 1) * limit,
            size: limit,
            sort: [{ createdAt: 'desc' }],
          },
        });

        return {
          logs: result.hits.hits.map((hit: any) => ({
            id: hit._id,
            ...hit._source,
          })),
          total: result.hits.total.value,
          source: 'elasticsearch',
        };
      });
    } catch (error) {
      logger.warn('ES search failed, falling back to database', { error: String(error) });
    }
  }

  // Fallback to database search
  const result = await auditRepository.query({
    search: query,
    userId: filters.userId,
    action: filters.action,
    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    page,
    limit,
  });

  return {
    logs: result.logs,
    total: result.total,
    source: 'database',
  };
}

/**
 * Get Elasticsearch health status
 */
export async function getElasticsearchHealth(): Promise<{
  available: boolean;
  status?: string;
  clusterName?: string;
}> {
  if (!esAvailable) return { available: false };

  try {
    const client = await getElasticsearchClient();
    if (!client) return { available: false };

    const health = await client.cluster.health();
    return {
      available: true,
      status: health.status,
      clusterName: health.cluster_name,
    };
  } catch {
    return { available: false };
  }
}

// Initialize on load (server-side only)
if (typeof window === 'undefined') {
  ensureIndex().catch(() => {});
}
