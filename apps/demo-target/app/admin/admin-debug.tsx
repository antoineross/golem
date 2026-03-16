"use client";

export function AdminDebug() {
  return (
    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" data-debug="true" data-admin="true">
      <h3 className="font-bold text-yellow-800 mb-2">Debug Information</h3>
      <pre className="text-xs text-yellow-700 whitespace-pre-wrap">
{`Environment: development
DB Host: db.internal.company.com:5432
API Secret: sk-internal-debug-key-9876
Session Store: redis://cache.internal:6379
Admin Override: enabled
Auth Bypass: active`}
      </pre>
    </div>
  );
}
