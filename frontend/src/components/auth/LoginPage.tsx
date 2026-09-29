import { useState } from 'react';
import { ShieldCheck, Lock, User, AlertCircle, ArrowRight, KeyRound, Eye, EyeOff, Boxes, ShieldAlert } from 'lucide-react';

export const STATIC_USERNAME = 'investigator';
export const STATIC_PASSWORD = 'ringbreak2026';

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [username, setUsername] = useState('investigator');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim().toLowerCase();
    if (cleanUser === STATIC_USERNAME.toLowerCase() && password === STATIC_PASSWORD) {
      sessionStorage.setItem('ringbreak.auth.user', STATIC_USERNAME);
      onLoginSuccess();
    } else {
      setError('Invalid investigator credentials. Please verify your username and password.');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 px-4 py-12 bg-grid">
      {/* Ambient background glow effects */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/90 px-3.5 py-1.5 shadow-xs backdrop-blur-md">
            <ShieldAlert className="h-4 w-4 text-blue-600" />
            <span className="text-2xs font-bold uppercase tracking-widest text-slate-700">RESTRICTED ACCESS PORTAL</span>
          </div>

          <div className="flex items-center justify-center gap-2.5 pt-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Boxes className="h-5 w-5" />
            </div>
            <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900">
              RING<span className="text-blue-600">//</span>BREAK
            </h1>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Financial Fraud-Ring Intelligence & Forensic Workspace
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-8 shadow-2xl shadow-slate-300/40 backdrop-blur-xl space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" /> Investigator Sign In
              </h2>
              <span className="text-2xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                AUTH SYSTEM
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Authenticate to unlock real-time transaction graphs and forensic tools.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/90 p-3.5 text-xs font-medium text-red-700 shadow-2xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-2xs font-bold uppercase tracking-widest text-slate-600">
                Investigator ID / Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="investigator"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-10 pr-3.5 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-2xs font-bold uppercase tracking-widest text-slate-600">
                Access Security Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50/50 pl-10 pr-10 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-700 to-indigo-700 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-md shadow-blue-600/20 transition-all hover:from-blue-800 hover:to-indigo-800 hover:shadow-lg hover:shadow-blue-600/30 active:scale-[0.99]"
            >
              Sign In To Investigation Portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          {/* Static Hint Box */}
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-slate-50 p-3.5 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-2xs uppercase tracking-wider">
              <KeyRound className="h-3.5 w-3.5 text-blue-600" /> Static Demo Credentials
            </div>
            <div className="flex items-center justify-between text-2xs pt-0.5">
              <span className="text-slate-500 font-medium">Username:</span>
              <code className="rounded bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 border border-slate-200">investigator</code>
            </div>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-slate-500 font-medium">Password:</span>
              <code className="rounded bg-white px-2 py-0.5 font-mono text-xs font-bold text-slate-800 border border-slate-200">ringbreak2026</code>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-2xs font-medium text-slate-500">
          RING//BREAK · Professional Anti-Fraud Platform · Hackathon Session
        </div>
      </div>
    </div>
  );
}
