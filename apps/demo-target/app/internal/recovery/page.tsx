import { RecoveryForm } from "./recovery-form";

export default function RecoveryPage() {
  return (
    <main className="max-w-md mx-auto px-4 py-24">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-bold mb-2">Session Recovery</h1>
        <p className="text-gray-500 text-sm mb-6">Enter the temporary access password to recover your admin session.</p>
        <RecoveryForm />
      </div>
    </main>
  );
}
