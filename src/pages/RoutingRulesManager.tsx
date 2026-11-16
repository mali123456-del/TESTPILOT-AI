import { useEffect, useState } from 'react';
import { Plus, Trash2, Settings, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/hooks';
import type { AiRoutingConfig, AiRoutingRule, AiProviderConfigPublic } from '../../shared/types';

export default function RoutingRulesManager() {
  const { auth } = useAuth();
  const [config, setConfig] = useState<AiRoutingConfig | null>(null);
  const [providers, setProviders] = useState<AiProviderConfigPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    loadConfig();
  }, [auth]);

  const loadConfig = async () => {
    try {
      const [configRes, providersRes] = await Promise.all([
        api<AiRoutingConfig>('/api/ai/routing'),
        api<AiProviderConfigPublic[]>('/api/ai/providers'),
      ]);
      setConfig(configRes);
      setProviders(providersRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routing configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    
    setSaving(true);
    try {
      await api('/api/ai/routing', { method: 'PATCH', body: config });
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
      setSaving(false);
    }
  };

  const addRule = () => {
    if (!config) return;
    
    const newRule: AiRoutingRule = {
      id: `rule_${Date.now()}`,
      workspaceId: auth!.workspace.id,
      taskCategory: 'case-generation',
      providerId: providers.find(p => p.enabled)?.id || '',
      fallbackProviderId: undefined,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    
    setConfig({
      ...config,
      rules: [...config.rules, newRule],
    });
  };

  const updateRule = (ruleId: string, updates: Partial<AiRoutingRule>) => {
    if (!config) return;
    
    setConfig({
      ...config,
      rules: config.rules.map(rule => 
        rule.id === ruleId ? { ...rule, ...updates } : rule
      ),
    });
  };

  const deleteRule = (ruleId: string) => {
    if (!config) return;
    
    setConfig({
      ...config,
      rules: config.rules.filter(rule => rule.id !== ruleId),
    });
  };

  const getProviderName = (providerId: string) => {
    return providers.find(p => p.id === providerId)?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Routing Rules Manager</h1>
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Routing Rules Manager</h1>
        <button
          onClick={saveConfig}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Default Provider */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Default Provider</h2>
          <p className="text-sm text-gray-600 mt-1">Fallback provider when no specific rule matches</p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-4">
            <select
              value={config?.defaultProviderId || ''}
              onChange={(e) => setConfig({ ...config!, defaultProviderId: e.target.value || null })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a default provider</option>
              {providers.filter(p => p.enabled).map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.kind})
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              {config?.defaultProviderId ? getProviderName(config.defaultProviderId) : 'No default set'}
            </span>
          </div>
        </div>
      </div>

      {/* Routing Rules */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Routing Rules</h2>
          <button
            onClick={addRule}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>
        <div className="p-6">
          {config?.rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Zap className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No routing rules configured</p>
              <p className="text-sm mt-2">Add rules to control which provider handles specific task types</p>
            </div>
          ) : (
            <div className="space-y-4">
              {config?.rules.map((rule) => (
                <div key={rule.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-gray-900">{rule.taskCategory}</span>
                      </div>
                      <p className="text-sm text-gray-600">Provider: {getProviderName(rule.providerId)}</p>
                      {rule.fallbackProviderId && (
                        <p className="text-sm text-gray-600">Fallback: {getProviderName(rule.fallbackProviderId)}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Primary Provider</label>
                      <select
                        value={rule.providerId}
                        onChange={(e) => updateRule(rule.id, { providerId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {providers.filter(p => p.enabled).map(provider => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.kind})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Provider (optional)</label>
                      <select
                        value={rule.fallbackProviderId || ''}
                        onChange={(e) => updateRule(rule.id, { fallbackProviderId: e.target.value || undefined })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">None</option>
                        {providers.filter(p => p.enabled && p.id !== rule.providerId).map(provider => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.kind})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task Categories Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-3">Available Task Categories</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-white rounded px-3 py-2">case-generation</div>
          <div className="bg-white rounded px-3 py-2">failure-triage</div>
          <div className="bg-white rounded px-3 py-2">assistant</div>
          <div className="bg-white rounded px-3 py-2">benchmark</div>
          <div className="bg-white rounded px-3 py-2">test-execution</div>
          <div className="bg-white rounded px-3 py-2">defect-triage</div>
        </div>
        <p className="text-sm text-blue-700 mt-3">Add custom categories as needed. Rules are evaluated in order.</p>
      </div>
    </div>
  );
}