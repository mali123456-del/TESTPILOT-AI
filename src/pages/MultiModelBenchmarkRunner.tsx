import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, BarChart3, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/hooks';

interface BenchmarkSuiteDef {
  id: string;
  name: string;
  capability: string;
  description: string;
  measures: string[];
  run: (target: any, providerConfig?: any) => Promise<any>;
}

export default function MultiModelBenchmarkRunner() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [targets, setTargets] = useState<Array<{
    modelId: string;
    providerId: string;
    providerKind: string;
    modelName: string;
    modelIdentifier: string;
    configHash?: string;
  }>>([]);
  const [suites] = useState<BenchmarkSuiteDef[]>([
    {
      id: 'generation-structure',
      name: 'Case generation structure & routing',
      capability: 'test-case-generation / structured output / instruction following',
      description: 'Generates cases from fixed requirements and measures structural validity, requested-count compliance, malformed-reply rate and area-routing exact match.',
      measures: ['passRate', 'instructionFollowing', 'exactMatch', 'structuredOutputRate', 'malformedJsonRate'],
      run: () => Promise.resolve({ metrics: {}, cases: [], errors: 0, notes: [], latencySamples: [] }),
    },
    {
      id: 'triage-accuracy',
      name: 'Failure triage accuracy',
      capability: 'failure classification / evidence reasoning',
      description: 'Classifies labelled failure fixtures into cause categories; computes micro-averaged precision, recall and F1 plus per-category F1.',
      measures: ['precision', 'recall', 'f1', 'passRate'],
      run: () => Promise.resolve({ metrics: {}, cases: [], errors: 0, notes: [], latencySamples: [] }),
    },
    {
      id: 'assistant-routing',
      name: 'Assistant intent routing',
      capability: 'context understanding / instruction following',
      description: 'Routes fixed questions to expected answer modes and measures intent accuracy.',
      measures: ['accuracy', 'passRate'],
      run: () => Promise.resolve({ metrics: {}, cases: [], errors: 0, notes: [], latencySamples: [] }),
    },
  ]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [selectedSuites, setSelectedSuites] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    loadTargets();
  }, [auth]);

  const loadTargets = async () => {
    try {
      const data = await api<{ targets: Array<{
        modelId: string;
        providerId: string;
        providerKind: string;
        modelName: string;
        modelIdentifier: string;
        configHash?: string;
      }> }>('/api/benchmarks/targets');
      setTargets(data.targets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load targets');
    }
  };

  const handleRun = async () => {
    if (selectedTargets.length === 0) {
      setError('Please select at least one target model');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Run benchmarks for each selected target
      const results = [];
      for (const targetId of selectedTargets) {
        const target = targets.find(t => t.modelId === targetId);
        if (!target) continue;

        const response = await fetch(`/api/benchmarks/run/${target.providerId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: label || `Benchmark for ${target.modelName}`,
            suiteIds: selectedSuites.length > 0 ? selectedSuites : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to run benchmark for ${target.modelName}`);
        }

        const result = await response.json();
        results.push({ target, result });
      }

      setSuccess(`Successfully started ${results.length} benchmark(s)`);
      setSelectedTargets([]);
      setLabel('');
      setTimeout(loadTargets, 2000); // Refresh targets
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run benchmarks');
    } finally {
      setLoading(false);
    }
  };

  const toggleTarget = (modelId: string) => {
    setSelectedTargets(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const toggleSuite = (suiteId: string) => {
    setSelectedSuites(prev => 
      prev.includes(suiteId) 
        ? prev.filter(id => id !== suiteId)
        : [...prev, suiteId]
    );
  };

  const selectAllTargets = () => {
    if (selectedTargets.length === targets.length) {
      setSelectedTargets([]);
    } else {
      setSelectedTargets(targets.map(t => t.modelId));
    }
  };

  const selectAllSuites = () => {
    if (selectedSuites.length === suites.length) {
      setSelectedSuites([]);
    } else {
      setSelectedSuites(suites.map(s => s.id));
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Multi-Model Benchmark Runner</h1>
        <button
          onClick={() => navigate('/app/benchmarks')}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          View Results
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Benchmark Configuration</h2>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Benchmark Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional: name this benchmark run"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Benchmark Suites</label>
              <button
                onClick={selectAllSuites}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedSuites.length === suites.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {suites.map((suite) => (
                <div key={suite.id} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      checked={selectedSuites.includes(suite.id)}
                      onChange={() => toggleSuite(suite.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium text-gray-900">{suite.name}</span>
                  </div>
                  <p className="text-sm text-gray-600">{suite.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Target Models */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Target Models ({targets.length})</h2>
          <button
            onClick={selectAllTargets}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {selectedTargets.length === targets.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="p-6">
          {targets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Zap className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No eligible benchmark targets found</p>
              <p className="text-sm mt-2">Configure AI providers and models in the Model Registry</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {targets.map((target) => (
                <div 
                  key={target.modelId} 
                  className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                    selectedTargets.includes(target.modelId) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleTarget(target.modelId)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{target.modelName}</h3>
                      <p className="text-sm text-gray-600">{target.modelIdentifier}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedTargets.includes(target.modelId)}
                      onChange={() => toggleTarget(target.modelId)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      target.providerKind === 'local' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {target.providerKind}
                    </span>
                    <span className="text-gray-500">{target.providerKind === 'local' ? 'Local' : 'Cloud'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Run Button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {selectedTargets.length > 0 ? (
            <span>{selectedTargets.length} model{selectedTargets.length > 1 ? 's' : ''} selected</span>
          ) : (
            <span>Select models to benchmark</span>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={loading || selectedTargets.length === 0}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <PlayCircle className="w-5 h-5" />
          {loading ? 'Running...' : `Run Benchmark${selectedTargets.length > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}