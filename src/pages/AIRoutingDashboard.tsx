import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bot, CheckCircle2, Clock, Database, Plug, Settings, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/hooks';
import type { AiRoutingConfig, AiRoutingDecision, AiProviderConfigPublic } from '../../shared/types';

export default function AIRoutingDashboard() {
  const { auth } = useAuth();
  const [config, setConfig] = useState<AiRoutingConfig | null>(null);
  const [decisions, setDecisions] = useState<AiRoutingDecision[]>([]);
  const [providers, setProviders] = useState<AiProviderConfigPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    loadDashboard();
  }, [auth]);

  const loadDashboard = async () => {
    try {
      const [configRes, decisionsRes, providersRes] = await Promise.all([
        api<AiRoutingConfig>('/api/ai/routing'),
        api<AiRoutingDecision[]>('/api/ai/routing/decisions?pageSize=10'),
        api<AiProviderConfigPublic[]>('/api/ai/providers'),
      ]);
      setConfig(configRes);
      setDecisions(decisionsRes);
      setProviders(providersRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routing data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">AI Routing Dashboard</h1>
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">AI Routing Dashboard</h1>
          <button
            onClick={loadDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">AI Routing Dashboard</h1>
        <Link
          to="/app/ai/routing"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Configure Routing
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Active Rules</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{config?.rules.filter(r => r.enabled).length || 0}</p>
          <p className="text-sm text-gray-500">routing rules configured</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-900">Success Rate</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {decisions.length > 0 
              ? `${Math.round((decisions.filter(d => d.success).length / decisions.length) * 100)}%` 
              : 'N/A'
            }
          </p>
          <p className="text-sm text-gray-500">last 100 decisions</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Avg Latency</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {decisions.length > 0 
              ? `${Math.round(decisions.reduce((sum, d) => sum + (d.latencyMs || 0), 0) / decisions.length)}ms` 
              : 'N/A'
            }
          </p>
          <p className="text-sm text-gray-500">routing decisions</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Providers</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900">{providers.length}</p>
          <p className="text-sm text-gray-500">configured providers</p>
        </div>
      </div>

      {/* Recent Decisions */}
      <div className="bg-white rounded-lg border border-gray-200 mb-8">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Routing Decisions</h2>
        </div>
        <div className="p-6">
          {decisions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No routing decisions yet</p>
          ) : (
            <div className="space-y-3">
              {decisions.slice(0, 5).map((decision) => (
                <div key={decision.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{decision.taskCategory}</p>
                    <p className="text-sm text-gray-600">{decision.reason}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      decision.success 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {decision.success ? 'Success' : 'Failed'}
                    </span>
                    {decision.latencyMs && (
                      <span className="text-sm text-gray-500">{decision.latencyMs}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/app/ai/benchmarks"
          className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Benchmark Runner</h3>
          </div>
          <p className="text-sm text-gray-600">Run multi-model benchmarks to compare performance</p>
        </Link>

        <Link
          to="/app/ai/playground"
          className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <Bot className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-gray-900">Playground</h3>
          </div>
          <p className="text-sm text-gray-600">Test and compare AI models side by side</p>
        </Link>

        <Link
          to="/app/ai/providers"
          className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            <Plug className="w-6 h-6 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Provider Center</h3>
          </div>
          <p className="text-sm text-gray-600">Manage AI providers and credentials</p>
        </Link>
      </div>
    </div>
  );
}