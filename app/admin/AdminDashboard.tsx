'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser, SignOutButton } from '@clerk/nextjs';

// ============================================
// TYPES
// ============================================

interface AdminProps {
  admin: { firstName: string; email: string; imageUrl?: string };
}

interface KPIs {
  totalUsers: number;
  activeUsers24h: number;
  newUsersWeek: number;
  totalRequests24h: number;
  totalErrors24h: number;
  errorRate: string;
  totalChats: number;
  totalPipelines: number;
  totalReports: number;
}

interface DashboardStats {
  kpis: KPIs;
  jobs: Record<string, number>;
  topEndpoints: Array<{ path: string; count: number }>;
  topUsers: Array<{ userId: string; email: string; count: number }>;
  hourlyStats: Array<{ hour: string; total: number; errors: number }>;
}

interface AuditLogEntry {
  id: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resource?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
  errorMessage?: string;
  requestId?: string;
  createdAt: string;
}

interface UserEntry {
  id: string;
  clerkId: string;
  email: string;
  role: string;
  lastLoginAt?: string;
  loginCount: number;
  createdAt: string;
  _count: { chats: number; pipelines: number; reports: number; auditLogs: number };
}

interface HealthCheck {
  status: string;
  checks: Record<string, { status: string; latency?: number; error?: string }>;
  system: {
    memoryUsage: Record<string, string>;
    uptime: string;
    nodeVersion: string;
    platform: string;
  };
}

interface JobEntry {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  priority: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

type TabId = 'overview' | 'activity' | 'users' | 'audit' | 'health' | 'jobs' | 'analytics';

// ============================================
// ICON COMPONENTS (minimal SVG icons)
// ============================================

const Icon = {
  Overview: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  Activity: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <polyline points="1,8 4,4 7,10 10,6 13,8 15,7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 7c1.1 0 2 .9 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13 14c0-1.86-.8-3.53-2.07-4.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Audit: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Health: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 14s-6-4.35-6-8a4 4 0 018 0 4 4 0 018 0c0 3.65-6 8-6 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Jobs: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 4.5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Analytics: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="9" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.5"/>
      <rect x="6" y="5" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="11" y="1" width="3" height="14" rx="0.5" fill="currentColor"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12.5 7A5.5 5.5 0 112.17 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 1v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Collapse: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Expand: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  SignOut: () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ============================================
// ADMIN DASHBOARD COMPONENT
// ============================================

export default function AdminDashboard({ admin }: AdminProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ logs: AuditLogEntry[]; total: number; pages: number }>({ logs: [], total: 0, pages: 0 });
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [jobs, setJobs] = useState<{ jobs: JobEntry[]; counts: Record<string, number> }>({ jobs: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditFilter, setAuditFilter] = useState({ method: '', action: '', statusCode: '' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ---- DATA FETCHING ----

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/audit?limit=30');
      if (res.ok) {
        const data = await res.json();
        setActivity(data.logs || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    const params = new URLSearchParams({
      page: auditPage.toString(),
      limit: '30',
      ...(searchQuery ? { search: searchQuery } : {}),
      ...(auditFilter.method ? { method: auditFilter.method } : {}),
      ...(auditFilter.action ? { action: auditFilter.action } : {}),
      ...(auditFilter.statusCode ? { statusCode: auditFilter.statusCode } : {}),
    });
    try {
      const res = await fetch(`/api/admin/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs({ logs: data.logs || [], total: data.total || 0, pages: data.pages || 0 });
      }
    } catch { /* ignore */ }
  }, [auditPage, searchQuery, auditFilter]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health');
      if (res.ok) setHealth(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs({ jobs: data.jobs || [], counts: data.counts || {} });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchActivity()]);
      setLoading(false);
    };
    load();
  }, [fetchStats, fetchActivity]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'health') fetchHealth();
    if (activeTab === 'jobs') fetchJobs();
    if (activeTab === 'analytics') fetchStats();
  }, [activeTab, fetchUsers, fetchAuditLogs, fetchHealth, fetchJobs, fetchStats]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
      if (activeTab === 'activity') fetchActivity();
      if (activeTab === 'health') fetchHealth();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchStats, fetchActivity, fetchHealth]);

  useEffect(() => {
    if (activeTab === 'audit') fetchAuditLogs();
  }, [auditPage, searchQuery, auditFilter, activeTab, fetchAuditLogs]);

  // ---- JOB ACTIONS ----

  const handleJobAction = async (jobId: string, action: 'retry' | 'cancel') => {
    try {
      await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action }),
      });
      fetchJobs();
    } catch { /* ignore */ }
  };

  // ---- HELPERS ----

  const formatDate = (date: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const timeAgo = (date: string) => {
    if (!date) return '—';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#22c55e';
      case 'degraded': case 'warning': return '#f59e0b';
      case 'unhealthy': case 'error': case 'failed': return '#ef4444';
      case 'running': return '#3b82f6';
      case 'pending': return '#f59e0b';
      case 'completed': return '#22c55e';
      case 'cancelled': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const methodColor = (method?: string) => {
    switch (method) {
      case 'GET': return '#22c55e';
      case 'POST': return '#3b82f6';
      case 'PUT': return '#f59e0b';
      case 'DELETE': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // ============================================
  // TABS CONFIG
  // ============================================

  const tabs: { id: TabId; label: string; IconComp: React.FC }[] = [
    { id: 'overview',   label: 'Overview',      IconComp: Icon.Overview },
    { id: 'activity',   label: 'Activity',       IconComp: Icon.Activity },
    { id: 'users',      label: 'Users',          IconComp: Icon.Users },
    { id: 'audit',      label: 'Audit Logs',     IconComp: Icon.Audit },
    { id: 'health',     label: 'System Health',  IconComp: Icon.Health },
    { id: 'jobs',       label: 'Jobs',           IconComp: Icon.Jobs },
    { id: 'analytics',  label: 'Analytics',      IconComp: Icon.Analytics },
  ];

  const tabSubtitles: Record<TabId, string> = {
    overview:  'Key performance indicators and system snapshot',
    activity:  'Real-time user activity feed',
    users:     'User management and activity tracking',
    audit:     'Complete audit log explorer',
    health:    'Infrastructure status and diagnostics',
    jobs:      'Background job queue management',
    analytics: 'Usage analytics and traffic patterns',
  };

  // ============================================
  // STYLES (shared tokens)
  // ============================================

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '10px',
    padding: '22px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: '1.2px',
    marginBottom: '6px',
  };

  const selectStyle: React.CSSProperties = {
    padding: '9px 14px',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '7px',
    background: '#0f0f14',
    color: '#d4d4d8',
    fontSize: '13px',
    outline: 'none',
    fontFamily: 'inherit',
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#09090d',
      color: '#d4d4d8',
      fontFamily: "'DM Sans', 'Geist', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .nav-btn:hover { background: rgba(255,255,255,0.04) !important; color: #a1a1aa !important; }
        .kpi-card:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important; }
        .row-hover:hover { background: rgba(255,255,255,0.025) !important; }
        .btn:hover { opacity: 0.85; }
      `}</style>

      {/* ---- SIDEBAR ---- */}
      <aside style={{
        width: sidebarCollapsed ? '60px' : '240px',
        background: '#0c0c11',
        borderRight: '1px solid rgba(255,255,255,0.055)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {/* Wordmark */}
        <div style={{
          padding: sidebarCollapsed ? '22px 0' : '22px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
        }}>
          <div>
            <div style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#e4e4e7',
              letterSpacing: '-0.3px',
              whiteSpace: 'nowrap',
            }}>
              {sidebarCollapsed ? 'DS' : 'DSAgent'}
            </div>
            {!sidebarCollapsed && (
              <div style={{
                fontSize: '10px',
                color: '#3f3f46',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                marginTop: '2px',
              }}>Admin Console</div>
            )}
          </div>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {tabs.map(({ id, label, IconComp }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                className="nav-btn"
                onClick={() => setActiveTab(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: sidebarCollapsed ? '11px 0' : '10px 14px',
                  marginBottom: '2px',
                  border: 'none',
                  borderRadius: '7px',
                  background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: isActive ? '#e4e4e7' : '#52525b',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  fontFamily: 'inherit',
                  letterSpacing: '-0.1px',
                }}
              >
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <IconComp />
                </span>
                {!sidebarCollapsed && <span>{label}</span>}
                {!sidebarCollapsed && isActive && (
                  <div style={{ marginLeft: 'auto', width: '5px', height: '5px', borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div style={{ padding: '8px' }}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '7px',
              background: 'transparent',
              color: '#3f3f46',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '12px',
              transition: 'color 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {sidebarCollapsed ? <Icon.Expand /> : <><Icon.Collapse /><span>Collapse</span></>}
          </button>
        </div>

        {/* Admin info */}
        <div style={{
          padding: '14px',
          borderTop: '1px solid rgba(255,255,255,0.055)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '7px',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}>
            {admin.firstName?.[0] || 'A'}
          </div>
          {!sidebarCollapsed && (
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{admin.firstName}</div>
              <div style={{ fontSize: '11px', color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin.email}</div>
            </div>
          )}
        </div>
      </aside>

      {/* ---- MAIN CONTENT ---- */}
      <main style={{ flex: 1, overflow: 'auto', padding: '32px 36px', minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#e4e4e7', margin: 0, letterSpacing: '-0.4px' }}>
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            <p style={{ fontSize: '13px', color: '#52525b', margin: '4px 0 0', letterSpacing: '-0.1px' }}>
              {tabSubtitles[activeTab]}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="btn"
              onClick={() => { fetchStats(); fetchActivity(); fetchHealth(); fetchJobs(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '7px',
                background: 'rgba(255,255,255,0.03)',
                color: '#71717a',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit',
                fontWeight: 500,
                transition: 'opacity 0.15s',
              }}
            >
              <Icon.Refresh /> Refresh
            </button>
            <SignOutButton>
              <button className="btn" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '7px',
                background: 'rgba(239,68,68,0.07)',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit',
                fontWeight: 500,
                transition: 'opacity 0.15s',
              }}>
                <Icon.SignOut /> Sign Out
              </button>
            </SignOutButton>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', marginBottom: '28px' }} />

        {loading && activeTab === 'overview' ? (
          <div style={{ textAlign: 'center', padding: '100px 0', color: '#3f3f46' }}>
            <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.06)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px' }} />
            <div style={{ fontSize: '13px', letterSpacing: '-0.1px' }}>Loading dashboard data...</div>
          </div>
        ) : (
          <>
            {/* =========== OVERVIEW TAB =========== */}
            {activeTab === 'overview' && stats && (
              <div>
                {/* KPI Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: 'Total Users',       value: stats.kpis.totalUsers,         accent: '#6366f1' },
                    { label: 'Active (24h)',       value: stats.kpis.activeUsers24h,     accent: '#22c55e' },
                    { label: 'New This Week',      value: stats.kpis.newUsersWeek,       accent: '#f59e0b' },
                    { label: 'API Requests (24h)',  value: stats.kpis.totalRequests24h,  accent: '#3b82f6' },
                    { label: 'Errors (24h)',        value: stats.kpis.totalErrors24h,    accent: '#ef4444' },
                    {
                      label: 'Error Rate',
                      value: stats.kpis.errorRate,
                      accent: (stats.kpis.errorRate === '0%' || parseFloat(stats.kpis.errorRate) < 1) ? '#22c55e' : '#ef4444',
                    },
                    { label: 'Total Chats',        value: stats.kpis.totalChats,        accent: '#8b5cf6' },
                    { label: 'Pipelines',           value: stats.kpis.totalPipelines,   accent: '#06b6d4' },
                    { label: 'Reports',             value: stats.kpis.totalReports,     accent: '#f97316' },
                  ].map((kpi, i) => (
                    <div
                      key={i}
                      className="kpi-card"
                      style={{
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: '10px',
                        padding: '20px',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        cursor: 'default',
                      }}
                    >
                      <div style={{ ...labelStyle, color: '#52525b' }}>{kpi.label}</div>
                      <div style={{ fontSize: '26px', fontWeight: 700, color: kpi.accent, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                        {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Job Status + Top Endpoints */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div style={card}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '16px', letterSpacing: '-0.1px' }}>Background Jobs</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                      {Object.entries(stats.jobs).map(([status, count]) => (
                        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor(status), flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', color: '#71717a', textTransform: 'capitalize' }}>{status}</span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: statusColor(status), fontFamily: "'DM Mono', monospace" }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '16px', letterSpacing: '-0.1px' }}>Top Endpoints (24h)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {stats.topEndpoints.slice(0, 5).map((ep, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#71717a', fontFamily: "'DM Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{ep.path}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1', fontFamily: "'DM Mono', monospace" }}>{ep.count}</span>
                        </div>
                      ))}
                      {stats.topEndpoints.length === 0 && <span style={{ fontSize: '12px', color: '#3f3f46' }}>No data recorded yet</span>}
                    </div>
                  </div>
                </div>

                {/* Hourly Traffic Chart */}
                <div style={{ ...card, marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '20px', letterSpacing: '-0.1px' }}>Hourly Traffic — 24h</div>
                  {stats.hourlyStats.length > 0 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '100px' }}>
                        {stats.hourlyStats.map((h, i) => {
                          const maxVal = Math.max(...stats.hourlyStats.map(s => s.total), 1);
                          const height = Math.max((h.total / maxVal) * 100, 3);
                          const errH = h.errors > 0 ? Math.max((h.errors / maxVal) * 100, 2) : 0;
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ position: 'relative', width: '100%', height: `${height}px`, background: 'rgba(99,102,241,0.35)', borderRadius: '3px 3px 0 0', minWidth: '6px' }}>
                                {errH > 0 && (
                                  <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${errH}px`, background: 'rgba(239,68,68,0.7)', borderRadius: '2px' }} />
                                )}
                              </div>
                              <span style={{ fontSize: '7px', color: '#3f3f46', marginTop: '4px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{h.hour.slice(-5)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(99,102,241,0.35)' }} />
                          <span style={{ fontSize: '11px', color: '#52525b' }}>Requests</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(239,68,68,0.7)' }} />
                          <span style={{ fontSize: '11px', color: '#52525b' }}>Errors</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#3f3f46', fontSize: '13px' }}>No traffic data yet</div>
                  )}
                </div>

                {/* Top Users */}
                <div style={card}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '16px', letterSpacing: '-0.1px' }}>Most Active Users (24h)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {stats.topUsers.slice(0, 8).map((u, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#3f3f46', fontFamily: "'DM Mono', monospace", width: '20px' }}>#{i + 1}</span>
                          <span style={{ fontSize: '13px', color: '#a1a1aa' }}>{u.email || u.userId}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1', fontFamily: "'DM Mono', monospace" }}>{u.count} actions</span>
                      </div>
                    ))}
                    {stats.topUsers.length === 0 && <span style={{ fontSize: '12px', color: '#3f3f46' }}>No user activity recorded yet</span>}
                  </div>
                </div>
              </div>
            )}

            {/* =========== ACTIVITY TAB =========== */}
            {activeTab === 'activity' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', color: '#52525b' }}>{activity.length} recent events</div>
                  <button className="btn" onClick={fetchActivity} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 13px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '6px', background: 'transparent', color: '#71717a', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', transition: 'opacity 0.15s' }}>
                    <Icon.Refresh /> Refresh
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {activity.map((log) => (
                    <div
                      key={log.id}
                      className="row-hover"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px 14px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: '8px',
                        transition: 'background 0.1s',
                      }}
                    >
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                        background: (log.statusCode && log.statusCode >= 500) ? '#ef4444' : (log.statusCode && log.statusCode >= 400) ? '#f59e0b' : '#22c55e',
                      }} />
                      {log.method && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                          background: `${methodColor(log.method)}18`, color: methodColor(log.method),
                          fontFamily: "'DM Mono', monospace",
                          flexShrink: 0,
                        }}>{log.method}</span>
                      )}
                      <span style={{ fontSize: '12px', color: '#a1a1aa', fontFamily: "'DM Mono', monospace", flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.path || log.action}
                      </span>
                      <span style={{ fontSize: '11px', color: '#52525b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.userEmail || log.userId || 'anonymous'}
                      </span>
                      {log.duration != null && (
                        <span style={{ fontSize: '11px', color: log.duration > 1000 ? '#f59e0b' : '#3f3f46', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                          {log.duration}ms
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: '#3f3f46', whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(log.createdAt)}</span>
                    </div>
                  ))}
                  {activity.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#3f3f46', fontSize: '13px' }}>
                      No activity recorded. Events will appear here as users interact with the app.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========== USERS TAB =========== */}
            {activeTab === 'users' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr>
                      {['Email', 'Role', 'Logins', 'Last Active', 'Chats', 'Pipelines', 'Reports', 'Actions', 'Joined'].map((h) => (
                        <th key={h} style={{ padding: '11px 12px', textAlign: 'left', ...labelStyle, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="row-hover"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.035)', transition: 'background 0.1s' }}
                      >
                        <td style={{ padding: '12px 12px', color: '#d4d4d8' }}>{user.email}</td>
                        <td style={{ padding: '12px 12px' }}>
                          <span style={{
                            padding: '3px 9px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                            background: user.role === 'admin' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                            color: user.role === 'admin' ? '#818cf8' : '#71717a',
                          }}>
                            {user.role}
                          </span>
                        </td>
                        <td style={{ padding: '12px 12px', color: '#a1a1aa', fontFamily: "'DM Mono', monospace" }}>{user.loginCount}</td>
                        <td style={{ padding: '12px 12px', color: '#71717a', fontSize: '12px' }}>{user.lastLoginAt ? timeAgo(user.lastLoginAt) : '—'}</td>
                        <td style={{ padding: '12px 12px', color: '#6366f1', fontFamily: "'DM Mono', monospace" }}>{user._count.chats}</td>
                        <td style={{ padding: '12px 12px', color: '#06b6d4', fontFamily: "'DM Mono', monospace" }}>{user._count.pipelines}</td>
                        <td style={{ padding: '12px 12px', color: '#f97316', fontFamily: "'DM Mono', monospace" }}>{user._count.reports}</td>
                        <td style={{ padding: '12px 12px', color: '#8b5cf6', fontFamily: "'DM Mono', monospace" }}>{user._count.auditLogs}</td>
                        <td style={{ padding: '12px 12px', color: '#3f3f46', fontSize: '12px', fontFamily: "'DM Mono', monospace" }}>{formatDate(user.createdAt)}</td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#3f3f46', fontSize: '13px' }}>No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* =========== AUDIT LOGS TAB =========== */}
            {activeTab === 'audit' && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setAuditPage(1); }}
                    style={{
                      flex: 1, minWidth: '200px', padding: '9px 14px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '7px', background: '#0f0f14', color: '#d4d4d8',
                      fontSize: '13px', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <select value={auditFilter.method} onChange={(e) => { setAuditFilter({ ...auditFilter, method: e.target.value }); setAuditPage(1); }} style={selectStyle}>
                    <option value="">All Methods</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <select value={auditFilter.statusCode} onChange={(e) => { setAuditFilter({ ...auditFilter, statusCode: e.target.value }); setAuditPage(1); }} style={selectStyle}>
                    <option value="">All Status Codes</option>
                    <option value="200">200 OK</option>
                    <option value="400">400 Bad Request</option>
                    <option value="401">401 Unauthorized</option>
                    <option value="403">403 Forbidden</option>
                    <option value="404">404 Not Found</option>
                    <option value="500">500 Server Error</option>
                  </select>
                </div>

                <div style={{ fontSize: '11px', color: '#3f3f46', marginBottom: '12px', fontFamily: "'DM Mono', monospace" }}>
                  Page {auditPage} of {auditLogs.pages} &mdash; {auditLogs.total.toLocaleString()} entries
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {['Timestamp', 'Method', 'Path / Action', 'User', 'Status', 'Duration', 'IP', 'Error'].map((h) => (
                          <th key={h} style={{ padding: '10px 10px', textAlign: 'left', ...labelStyle, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.logs.map((log) => (
                        <tr key={log.id} className="row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.1s' }}>
                          <td style={{ padding: '10px 10px', color: '#71717a', whiteSpace: 'nowrap', fontSize: '11px', fontFamily: "'DM Mono', monospace" }}>{formatDate(log.createdAt)}</td>
                          <td style={{ padding: '10px 10px' }}>
                            {log.method && (
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${methodColor(log.method)}18`, color: methodColor(log.method), fontFamily: "'DM Mono', monospace" }}>{log.method}</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 10px', color: '#a1a1aa', fontFamily: "'DM Mono', monospace", maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.path || log.action}</td>
                          <td style={{ padding: '10px 10px', color: '#71717a', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.userEmail || '—'}</td>
                          <td style={{ padding: '10px 10px' }}>
                            {log.statusCode && (
                              <span style={{ fontSize: '11px', fontWeight: 600, color: log.statusCode >= 500 ? '#ef4444' : log.statusCode >= 400 ? '#f59e0b' : '#22c55e', fontFamily: "'DM Mono', monospace" }}>{log.statusCode}</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 10px', color: '#52525b', fontFamily: "'DM Mono', monospace" }}>{log.duration != null ? `${log.duration}ms` : '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#3f3f46', fontSize: '11px', fontFamily: "'DM Mono', monospace" }}>{log.ip || '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#ef4444', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>{log.errorMessage || ''}</td>
                        </tr>
                      ))}
                      {auditLogs.logs.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#3f3f46', fontSize: '13px' }}>No audit logs match the current filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {auditLogs.pages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
                    <button
                      disabled={auditPage <= 1}
                      onClick={() => setAuditPage(auditPage - 1)}
                      style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', background: 'transparent', color: auditPage <= 1 ? '#3f3f46' : '#a1a1aa', cursor: auditPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontFamily: 'inherit' }}
                    >Previous</button>
                    <span style={{ fontSize: '12px', color: '#52525b', fontFamily: "'DM Mono', monospace", padding: '0 4px' }}>Page {auditPage}</span>
                    <button
                      disabled={auditPage >= auditLogs.pages}
                      onClick={() => setAuditPage(auditPage + 1)}
                      style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', background: 'transparent', color: auditPage >= auditLogs.pages ? '#3f3f46' : '#a1a1aa', cursor: auditPage >= auditLogs.pages ? 'not-allowed' : 'pointer', fontSize: '12px', fontFamily: 'inherit' }}
                    >Next</button>
                  </div>
                )}
              </div>
            )}

            {/* =========== HEALTH TAB =========== */}
            {activeTab === 'health' && health && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '16px', padding: '18px 22px', marginBottom: '24px',
                  background: health.status === 'healthy' ? 'rgba(34,197,94,0.07)' : 'rgba(245,158,11,0.07)',
                  border: `1px solid ${health.status === 'healthy' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                  borderRadius: '10px',
                }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusColor(health.status), flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: statusColor(health.status), textTransform: 'uppercase', letterSpacing: '0.5px' }}>{health.status}</div>
                    <div style={{ fontSize: '12px', color: '#52525b', marginTop: '2px' }}>All services checked</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                  {Object.entries(health.checks).map(([name, check]) => (
                    <div key={name} style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#d4d4d8', textTransform: 'capitalize' }}>
                          {name.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        <span style={{
                          padding: '3px 9px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                          background: `${statusColor(check.status)}15`, color: statusColor(check.status),
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>{check.status}</span>
                      </div>
                      {check.latency != null && (
                        <div style={{ fontSize: '12px', color: '#52525b' }}>
                          Latency: <span style={{ color: check.latency > 500 ? '#f59e0b' : '#22c55e', fontFamily: "'DM Mono', monospace" }}>{check.latency}ms</span>
                        </div>
                      )}
                      {check.error && (
                        <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '10px', wordBreak: 'break-all', lineHeight: 1.5 }}>{check.error}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={card}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '18px', letterSpacing: '-0.1px' }}>System Information</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '18px' }}>
                    {Object.entries(health.system.memoryUsage).map(([key, val]) => (
                      <div key={key}>
                        <div style={labelStyle}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#6366f1', fontFamily: "'DM Mono', monospace" }}>{val}</div>
                      </div>
                    ))}
                    <div>
                      <div style={labelStyle}>Uptime</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e', fontFamily: "'DM Mono', monospace" }}>{health.system.uptime}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Node Version</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#d4d4d8', fontFamily: "'DM Mono', monospace" }}>{health.system.nodeVersion}</div>
                    </div>
                    <div>
                      <div style={labelStyle}>Platform</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#d4d4d8', fontFamily: "'DM Mono', monospace" }}>{health.system.platform}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========== JOBS TAB =========== */}
            {activeTab === 'jobs' && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                  {Object.entries(jobs.counts).map(([status, count]) => (
                    <div key={status} style={{
                      padding: '14px 22px',
                      background: 'rgba(255,255,255,0.025)',
                      border: `1px solid ${statusColor(status)}25`,
                      borderRadius: '9px',
                      textAlign: 'center',
                      minWidth: '90px',
                    }}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: statusColor(status), fontFamily: "'DM Mono', monospace" }}>{count}</div>
                      <div style={{ ...labelStyle, marginBottom: 0, marginTop: '4px', color: '#52525b' }}>{status}</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {['Type', 'Status', 'Attempts', 'Priority', 'Created', 'Started', 'Completed', 'Error', 'Actions'].map((h) => (
                          <th key={h} style={{ padding: '10px 10px', textAlign: 'left', ...labelStyle, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.jobs.map((job) => (
                        <tr key={job.id} className="row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.1s' }}>
                          <td style={{ padding: '10px 10px', color: '#d4d4d8', fontFamily: "'DM Mono', monospace" }}>{job.type}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: `${statusColor(job.status)}15`, color: statusColor(job.status), textTransform: 'uppercase', letterSpacing: '0.5px' }}>{job.status}</span>
                          </td>
                          <td style={{ padding: '10px 10px', color: '#a1a1aa', fontFamily: "'DM Mono', monospace" }}>{job.attempts}/{job.maxAttempts}</td>
                          <td style={{ padding: '10px 10px', color: '#71717a', fontFamily: "'DM Mono', monospace" }}>{job.priority}</td>
                          <td style={{ padding: '10px 10px', color: '#71717a', fontSize: '11px', whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>{formatDate(job.createdAt)}</td>
                          <td style={{ padding: '10px 10px', color: '#71717a', fontSize: '11px', whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>{job.startedAt ? formatDate(job.startedAt) : '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#71717a', fontSize: '11px', whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace" }}>{job.completedAt ? formatDate(job.completedAt) : '—'}</td>
                          <td style={{ padding: '10px 10px', color: '#ef4444', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>{job.error || ''}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {job.status === 'failed' && (
                                <button onClick={() => handleJobAction(job.id, 'retry')} style={{ padding: '4px 10px', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '4px', background: 'rgba(34,197,94,0.08)', color: '#22c55e', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Retry</button>
                              )}
                              {(job.status === 'pending' || job.status === 'running') && (
                                <button onClick={() => handleJobAction(job.id, 'cancel')} style={{ padding: '4px 10px', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>Cancel</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {jobs.jobs.length === 0 && (
                        <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#3f3f46', fontSize: '13px' }}>No background jobs</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* =========== ANALYTICS TAB =========== */}
            {activeTab === 'analytics' && stats && (
              <div>
                <div style={{ ...card, marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '20px', letterSpacing: '-0.1px' }}>API Requests Over Time — 24h</div>
                  {stats.hourlyStats.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '160px' }}>
                      {stats.hourlyStats.map((h, i) => {
                        const maxVal = Math.max(...stats.hourlyStats.map(s => s.total), 1);
                        const height = Math.max((h.total / maxVal) * 140, 3);
                        return (
                          <div key={i} title={`${h.hour}: ${h.total} requests, ${h.errors} errors`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ fontSize: '8px', color: '#3f3f46', marginBottom: '4px', fontFamily: "'DM Mono', monospace" }}>{h.total || ''}</div>
                            <div style={{ width: '100%', height: `${height}px`, borderRadius: '3px 3px 0 0', background: 'rgba(99,102,241,0.4)', minWidth: '8px', transition: 'height 0.3s' }} />
                            <span style={{ fontSize: '7px', color: '#3f3f46', marginTop: '5px', fontFamily: "'DM Mono', monospace" }}>{h.hour.slice(-2)}h</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '50px', color: '#3f3f46', fontSize: '13px' }}>No traffic data yet</div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  {/* Top Endpoints with bar */}
                  <div style={card}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '18px', letterSpacing: '-0.1px' }}>Top Endpoints</div>
                    {stats.topEndpoints.map((ep, i) => {
                      const maxCount = Math.max(...stats.topEndpoints.map(e => e.count), 1);
                      const width = (ep.count / maxCount) * 100;
                      return (
                        <div key={i} style={{ marginBottom: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontSize: '11px', color: '#71717a', fontFamily: "'DM Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{ep.path}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6366f1', fontFamily: "'DM Mono', monospace" }}>{ep.count}</span>
                          </div>
                          <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px' }}>
                            <div style={{ width: `${width}%`, height: '100%', background: '#6366f1', borderRadius: '2px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                    {stats.topEndpoints.length === 0 && <span style={{ fontSize: '12px', color: '#3f3f46' }}>No data yet</span>}
                  </div>

                  {/* Top Users with bar */}
                  <div style={card}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '18px', letterSpacing: '-0.1px' }}>Most Active Users</div>
                    {stats.topUsers.map((u, i) => {
                      const maxCount = Math.max(...stats.topUsers.map(x => x.count), 1);
                      const width = (u.count / maxCount) * 100;
                      return (
                        <div key={i} style={{ marginBottom: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontSize: '11px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{u.email || u.userId}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#8b5cf6', fontFamily: "'DM Mono', monospace" }}>{u.count}</span>
                          </div>
                          <div style={{ width: '100%', height: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px' }}>
                            <div style={{ width: `${width}%`, height: '100%', background: '#8b5cf6', borderRadius: '2px', transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                    {stats.topUsers.length === 0 && <span style={{ fontSize: '12px', color: '#3f3f46' }}>No data yet</span>}
                  </div>
                </div>

                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {[
                    { label: 'Avg Response Time', value: 'See Logs',                    color: '#3b82f6' },
                    { label: 'Error Rate (24h)',    value: stats.kpis.errorRate,          color: parseFloat(stats.kpis.errorRate) > 5 ? '#ef4444' : '#22c55e' },
                    { label: 'Total Users',          value: stats.kpis.totalUsers,        color: '#6366f1' },
                    { label: 'API Calls (24h)',       value: stats.kpis.totalRequests24h, color: '#06b6d4' },
                  ].map((c, i) => (
                    <div key={i} style={{ ...card, textAlign: 'center' }}>
                      <div style={{ ...labelStyle, marginBottom: '10px' }}>{c.label}</div>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: c.color, fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' }}>
                        {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}