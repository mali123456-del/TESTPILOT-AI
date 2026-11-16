import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Zap, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/hooks';
import type { AiRoutingDecision, AiBenchmarkExecution, AiProviderConfigPublic } from '../../shared/types';

export default function AIOrchestrationAnalytics() {
  const { auth } = useAuth();
  const [decisions, setDecisions] = useState<AiRoutingDecision[]>([]);
  const [benchmarkExecutions, setBenchmarkExecutions] = useState<AiBenchmarkExecution[]>([]);
  const [providers, setProviders] = useState<AiProviderConfigPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    loadAnalytics();
  }, [auth]);

  const loadAnalytics = async () => {
    try {
      const [decisionsRes, executionsRes, providersRes] = await Promise.all([
        api<AiRoutingDecision[]>('/api/ai/routing/decisions?pageSize=100'),
        api<AiBenchmarkExecution[]>('/api/benchmarks/executions'),
        api<AiProviderConfigPublic[]>('/api/ai/providers'),
      ]);
      setDecisions(decisionsRes);
      setBenchmarkExecutions(executionsRes);
      setProviders(providersRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // Calculate routing metrics
  const routingMetrics = {
    totalDecisions: decisions.length,
    successRate: decisions.length > 0 
      ? Math.round((decisions.filter(d => d.success).length / decisions.length) * 100)
      : 0,
    avgLatency: decisions.length > 0
      ? Math.round(decisions.reduce((sum, d) => sum + (d.latencyMs || 0), 0) / decisions.length)
      : 0,
    fallbackRate: decisions.length > 0
      ? Math.round((decisions.filter(d => d.reason.includes('fallback')).length / decisions.length) * 100)
      : 0,
  };

  // Calculate benchmark metrics
  const benchmarkMetrics = {
    totalExecutions: benchmarkExecutions.length,
    successRate: benchmarkExecutions.length > 0
      ? Math.round((benchmarkExecutions.filter(e => e.status === 'completed').length / benchmarkExecutions.length) * 100)
      : 0,
    avgLatency: benchmarkExecutions.length > 0
      ? Math.round(benchmarkExecutions.reduce((sum, e) => sum + (e.results.reduce((acc, r) => acc + (r.avgLatencyMs || 0), 0) / e.results.length), 0) / benchmarkExecutions.length)
      : 0,
  };

  // Group decisions by task category
  const decisionsByCategory = decisions.reduce((acc, decision) => {
    acc[decision.taskCategory] = (acc[decision.taskCategory] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group benchmark executions by status
  const executionsByStatus = benchmarkExecutions.reduce((acc, execution) => {
    acc[execution.status] = (acc[execution.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">AI Orchestration Analytics</h1>
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">AI Orchestration Analytics</h1>
        <button
          onClick={loadAnalytics}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Routing Decisions</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{routingMetrics.totalDecisions}</p>
          <p className="text-sm text-gray-500">total routing decisions</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-900">Routing Success</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{routingMetrics.successRate}%</p>
          <p className="text-sm text-gray-500">of routing decisions</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Benchmark Runs</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{benchmarkMetrics.totalExecutions}</p>
          <p className="text-sm text-gray-500">multi-model benchmarks</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Avg Latency</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{benchmarkMetrics.avgLatency}ms</p>
          <p className="text-sm text-gray-500">benchmark execution</p>
        </div>
      </div>

      {/* Routing Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Routing Performance</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Success Rate</span>
                <span className="text-sm font-bold text-green-600">{routingMetrics.successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${routingMetrics.successRate}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Fallback Rate</span>
                <span className="text-sm font-bold text-orange-600">{routingMetrics.fallbackRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-orange-600 h-2 rounded-full" 
                  style={{ width: `${routingMetrics.fallbackRate}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Average Latency</span>
                <span className="text-sm font-bold text-blue-600">{routingMetrics.avgLatency}ms</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${Math.min(100, routingMetrics.avgLatency / 50)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Decisions by Category</h3>
            <div className="space-y-2">
              {Object.entries(decisionsByCategory).map(([category, count]) => (
                <div key={category} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{category}</span>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Benchmark Performance</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Success Rate</span>
                <span className="text-sm font-bold text-green-600">{benchmarkMetrics.successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full" 
                  style={{ width: `${benchmarkMetrics.successRate}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Average Latency</span>
                <span className="text-sm font-bold text-blue-600">{benchmarkMetrics.avgLatency}ms</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${Math.min(100, benchmarkMetrics.avgLatency / 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Executions by Status</h3>
            <div className="space-y-2">
              {Object.entries(executionsByStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-2">
                    {status === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : status === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
                    )}
                    {status}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Provider Health */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Provider Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <div key={provider.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900">{provider.name}</h3>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  provider.enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {provider.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{provider.kind}</p>
              <div className="text-xs text-gray-500">
                {provider.credentialsConfigured ? '✓ Credentials configured' : '⚠ No credentials'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}