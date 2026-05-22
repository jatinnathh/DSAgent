// lib/services/adminService.ts — Admin-specific business logic
import { userRepository } from '../repositories/userRepository';
import { auditRepository } from '../repositories/auditRepository';
import { jobRepository } from '../repositories/jobRepository';
import { chatRepository } from '../repositories/chatRepository';
import { pipelineRepository } from '../repositories/pipelineRepository';
import { reportRepository } from '../repositories/reportRepository';
import { backendCircuitBreaker, elasticsearchCircuitBreaker } from '../circuit-breaker';
import logger from '../logger';

export const adminService = {
  /** Get KPI dashboard stats */
  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers24h,
      newUsersWeek,
      totalRequests24h,
      totalErrors24h,
      totalChats,
      totalPipelines,
      totalReports,
      jobCounts,
      topEndpoints,
      topUsers,
      hourlyStats,
    ] = await Promise.all([
      userRepository.count(),
      userRepository.countActiveUsers(24),
      userRepository.countNewUsersThisWeek(),
      auditRepository.countRecent(24),
      auditRepository.countErrors(24),
      chatRepository.count(),
      pipelineRepository.count(),
      reportRepository.count(),
      jobRepository.countByStatus(),
      auditRepository.getTopEndpoints(24, 10),
      auditRepository.getTopUsers(24, 10),
      auditRepository.getHourlyStats(24),
    ]);

    const errorRate = totalRequests24h > 0 ? ((totalErrors24h / totalRequests24h) * 100).toFixed(2) : '0';

    return {
      kpis: {
        totalUsers,
        activeUsers24h,
        newUsersWeek,
        totalRequests24h,
        totalErrors24h,
        errorRate: `${errorRate}%`,
        totalChats,
        totalPipelines,
        totalReports,
      },
      jobs: jobCounts,
      topEndpoints,
      topUsers,
      hourlyStats,
    };
  },

  /** Get system health status */
  async getSystemHealth() {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Database check
    const dbStart = Date.now();
    try {
      await userRepository.count();
      checks.database = { status: 'healthy', latency: Date.now() - dbStart };
    } catch (err) {
      checks.database = { status: 'unhealthy', latency: Date.now() - dbStart, error: String(err) };
    }

    // Python backend check
    const backendStart = Date.now();
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      checks.pythonBackend = {
        status: response.ok ? 'healthy' : 'unhealthy',
        latency: Date.now() - backendStart,
      };
    } catch (err) {
      checks.pythonBackend = {
        status: 'unhealthy',
        latency: Date.now() - backendStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Circuit breaker statuses
    checks.backendCircuitBreaker = {
      status: backendCircuitBreaker.getStats().state === 'CLOSED' ? 'healthy' : 'degraded',
      ...backendCircuitBreaker.getStats(),
    } as any;

    checks.elasticsearchCircuitBreaker = {
      status: elasticsearchCircuitBreaker.getStats().state === 'CLOSED' ? 'healthy' : 'degraded',
      ...elasticsearchCircuitBreaker.getStats(),
    } as any;

    // Memory usage
    const memUsage = process.memoryUsage();
    const systemInfo = {
      memoryUsage: {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(1)} MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(1)} MB`,
      },
      uptime: `${(process.uptime() / 3600).toFixed(1)} hours`,
      nodeVersion: process.version,
      platform: process.platform,
    };

    const overallStatus = Object.values(checks).every(
      (c) => c.status === 'healthy'
    )
      ? 'healthy'
      : 'degraded';

    return { status: overallStatus, checks, system: systemInfo };
  },

  /** Get recent activity feed */
  async getActivityFeed(limit?: number) {
    return auditRepository.getRecentActivity(limit);
  },

  /** Get audit logs with filters */
  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    method?: string;
    statusCode?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return auditRepository.query({
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    });
  },

  /** Get system events */
  async getSystemEvents(limit?: number) {
    return auditRepository.getSystemEvents(limit);
  },

  /** Get background jobs */
  async getJobs(filters?: { status?: string; type?: string; page?: number; limit?: number }) {
    return jobRepository.findAll(filters);
  },

  /** Get job status counts */
  async getJobCounts() {
    return jobRepository.countByStatus();
  },

  /** Retry a failed job */
  async retryJob(jobId: string) {
    const result = await jobRepository.retry(jobId);
    logger.info('Job retried by admin', { jobId });
    return result;
  },

  /** Cancel a job */
  async cancelJob(jobId: string) {
    const result = await jobRepository.cancel(jobId);
    logger.info('Job cancelled by admin', { jobId });
    return result;
  },
};
