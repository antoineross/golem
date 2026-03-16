import { HealthCanvas } from "./health-canvas";

export default function SystemHealthPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">System Health</h1>
      <p className="text-gray-500 mb-8">Real-time monitoring dashboard</p>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Performance Metrics</h2>
        <HealthCanvas />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Uptime</p>
          <p className="text-2xl font-bold text-green-600">99.7%</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Avg Response</p>
          <p className="text-2xl font-bold text-blue-600">142ms</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Error Rate</p>
          <p className="text-2xl font-bold text-yellow-600">0.3%</p>
        </div>
      </div>
    </main>
  );
}
