import { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { STATIC_PASSWORD } from './LoginPage';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password === STATIC_PASSWORD) {
      sessionStorage.removeItem('ringbreak.locked');
      onUnlock();
    } else {
      setError('Incorrect password. Access denied.');
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Lock Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-glow-warn">
            <Lock className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="font-mono text-xl font-bold tracking-tight text-white">
            APPLICATION LOCKED
          </h1>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-2xs font-semibold uppercase tracking-widest text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5" /> Privacy & Security Lock
          </div>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Session locked automatically due to tab switch to protect sensitive forensic investigation data.
          </p>
        </div>

        {/* Lock Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-widest text-slate-400">
                Enter Investigator Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (ringbreak2026)"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 transition-colors focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/20 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-amber-300 transition-all hover:bg-amber-500/30"
            >
              Unlock Application <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
