import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useAuth } from './lib/hooks';
import { Loading } from './components/ui';

const Login = lazy(() => import('./pages/Login'));
const Site = lazy(() => import('./pages/Site'));
const Overview = lazy(() => import('./pages/Overview'));
const Projects = lazy(() => import('./pages/Projects'));
const Runs = lazy(() => import('./pages/Runs'));
const ExecutionWorkspace = lazy(() => import('./pages/ExecutionWorkspace'));
const Automation = lazy(() => import('./pages/Automation'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Agents = lazy(() => import('./pages/Agents'));
const Benchmarks = lazy(() => import('./pages/Benchmarks'));
const AIProviders = lazy(() => import('./pages/AIProviders'));
const AIModels = lazy(() => import('./pages/AIModels'));
const AIPlayground = lazy(() => import('./pages/AIPlayground'));
const AIHealth = lazy(() => import('./pages/AIHealth'));
const AIRouting = lazy(() => import('./pages/AIRouting'));
const AIActivity = lazy(() => import('./pages/AIActivity'));
const AIRoutingDashboard = lazy(() => import('./pages/AIRoutingDashboard'));
const RoutingRulesManager = lazy(() => import('./pages/RoutingRulesManager'));
const MultiModelBenchmarkRunner = lazy(() => import('./pages/MultiModelBenchmarkRunner'));
const PlaygroundSessionManager = lazy(() => import('./pages/PlaygroundSessionManager'));
const AIOrchestrationAnalytics = lazy(() => import('./pages/AIOrchestrationAnalytics'));
const Bugs = lazy(() => import('./pages/Bugs'));
const Reports = lazy(() => import('./pages/Reports'));
const ApiWorkspace = lazy(() => import('./pages/ApiWorkspace'));
const Performance = lazy(() => import('./pages/Performance'));
const Security = lazy(() => import('./pages/Security'));
const Integrations = lazy(() => import('./pages/Integrations'));
const Team = lazy(() => import('./pages/Team'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Docs = lazy(() => import('./pages/Docs'));

function Protected({ children }: { children: React.ReactNode }) {
  const { auth, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ padding: 48, maxWidth: 420, margin: '0 auto' }}>
        <Loading rows={4} />
      </div>
    );
  }
  if (!auth) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (auth.mustChangePassword === true && location.pathname !== '/app/change-password') {
    return <Navigate to="/app/change-password" replace />;
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div style={{ padding: 64, textAlign: 'center' }}>
      <h1>Page not found</h1>
      <p className="muted" style={{ margin: '8px 0 20px' }}>That route does not exist in TESTPILOT AI.</p>
      <Link className="btn btn-primary" to="/app">Back to the app</Link>
    </div>
  );
}

export function App() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 48, maxWidth: 480, margin: '0 auto' }}>
          <Loading rows={4} />
        </div>
      }
    >
      <Routes>
        <Route path="/site" element={<Site />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route
          path="/app"
          element={
            <Protected>
              <Shell />
            </Protected>
          }
        >
          <Route index element={<Overview />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:projectId" element={<Projects />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:runId/execute" element={<ExecutionWorkspace />} />
          <Route path="automation" element={<Automation />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="agents" element={<Agents />} />
          <Route path="benchmarks" element={<Benchmarks />} />
          <Route path="ai/providers" element={<AIProviders />} />
          <Route path="ai/models" element={<AIModels />} />
          <Route path="ai/playground" element={<AIPlayground />} />
          <Route path="ai/health" element={<AIHealth />} />
          <Route path="ai/routing" element={<AIRouting />} />
          <Route path="ai/activity" element={<AIActivity />} />
          <Route path="ai/routing-dashboard" element={<AIRoutingDashboard />} />
          <Route path="ai/routing-rules" element={<RoutingRulesManager />} />
          <Route path="ai/benchmark-runner" element={<MultiModelBenchmarkRunner />} />
          <Route path="ai/playground-sessions" element={<PlaygroundSessionManager />} />
          <Route path="ai/orchestration-analytics" element={<AIOrchestrationAnalytics />} />
          <Route path="api" element={<ApiWorkspace />} />
          <Route path="performance" element={<Performance />} />
          <Route path="security" element={<Security />} />
          <Route path="bugs" element={<Bugs />} />
          <Route path="reports" element={<Reports />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="team" element={<Team />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="docs" element={<Docs />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
