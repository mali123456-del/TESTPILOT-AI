/**
 * Provider Activity History (Phase 40).
 *
 * Shows the append-only audit log of provider management actions:
 * creation, edits, credential changes, connection tests, health checks,
 * model discovery, playground usage, and routing changes.
 *
 * Backend: GET /api/ai/activity.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert, Activity } from 'lucide-react';
import type { ProviderActivity } from '../../shared/types';
import { api } from '../lib/api';
import { Badge, Card, CardHead, EmptyState, Loading } from '../components/ui';

export default function AIActivity() {
  const [activities, setActivities] = useState<ProviderActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(() => {
    setLoading(true);
    api<{ items: ProviderActivity[]; total: number; page: number; pageSize: number; pages: number }>(`/ai/activity?page=${page}&pageSize=${pageSize}`)
      .then((d) => {
        setActivities(d.items);
        setTotal(d.total);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const actionLabel = (a: string) => a.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Provider Activity History</div>
          <div className="small faint">Append-only audit log of provider management actions.</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={13} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="badge badge-bad" style={{ padding: 8 }}><ShieldAlert size={12} /> {error}</div>}

      {loading ? <Loading rows={4} /> : (
        activities.length === 0 ? (
          <Card>
            <EmptyState icon={<Activity size={24} />} title="No provider activity" desc="Provider actions will appear here once you configure providers." />
          </Card>
        ) : (
          <>
            <Card>
              <CardHead title="Activity Log" desc={`${total} event(s) — records are append-only and never modified`} />
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Time</th><th>Action</th><th>Provider</th><th>Result</th><th>Latency</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {activities.map((a) => (
                      <tr key={a.id}>
                        <td className="small faint">{new Date(a.createdAt).toLocaleString()}</td>
                        <td className="small">{actionLabel(a.action)}</td>
                        <td className="small mono">{a.providerId ?? '—'}</td>
                        <td><Badge status={a.success ? 'passed' : 'failed'}>{a.success ? 'Success' : 'Failed'}</Badge></td>
                        <td className="small mono">{a.latencyMs ?? '—'} ms</td>
                        <td className="small faint">{a.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div className="small faint">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button className="btn btn-sm" disabled={page * pageSize >= total || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
              <div className="small faint">Page size:
                <select className="select" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
