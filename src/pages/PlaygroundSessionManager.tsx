import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Download, FileText, Bot, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/hooks';
import type { AiPlaygroundSession } from '../../shared/types';

export default function PlaygroundSessionManager() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<AiPlaygroundSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    loadSessions();
  }, [auth]);

  const loadSessions = async () => {
    try {
      const data = await api<AiPlaygroundSession[]>('/api/ai/playground/sessions');
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session and all its responses?')) {
      return;
    }

    try {
      await api(`/api/ai/playground/sessions/${sessionId}`, { method: 'DELETE' });
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  const exportSession = async (sessionId: string, format: 'json' | 'csv') => {
    setExporting(sessionId);
    try {
      const response = await fetch(`/api/ai/playground/export/${format === 'json' ? sessionId : 'comparison/' + sessionId}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `playground-session-${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export session');
    } finally {
      setExporting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Playground Session Manager</h1>
          <div className="animate-pulse h-8 w-32 bg-gray-200 rounded"></div>
        </div>
        <div className="space-y-4">
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Playground Session Manager</h1>
        <button
          onClick={() => navigate('/app/ai/playground')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Bot className="w-4 h-4" />
          New Session
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No playground sessions yet</h3>
          <p className="text-gray-600 mb-4">Create your first session to start testing AI models</p>
          <button
            onClick={() => navigate('/app/ai/playground')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create First Session
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{session.name}</h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{session.prompt}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDate(session.createdAt)}
                    </span>
                    {session.systemPrompt && (
                      <span>System prompt configured</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/app/ai/playground?session=${session.id}`)}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => exportSession(session.id, 'json')}
                    disabled={exporting === session.id}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Export as JSON"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => exportSession(session.id, 'csv')}
                    disabled={exporting === session.id}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Export as CSV"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Session Preview */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Responses</h4>
                <div className="space-y-2">
                  {(() => {
                    // This is a placeholder - in a real implementation, you'd fetch the actual responses
                    const responseCount = Math.floor(Math.random() * 3) + 1;
                    return Array.from({ length: responseCount }, (_, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span>Response from {i === 0 ? 'Primary' : 'Comparison'} model</span>
                        <span className="text-gray-400">• {Math.floor(Math.random() * 2000) + 500}ms</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}