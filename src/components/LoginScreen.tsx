import React, { useState } from 'react';
import { Role } from '../types';
import { Settings, UserCircle, KeyRound, ShieldAlert } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (role: Role) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "1234") {
      onLogin("Admin");
    } else {
      setError("كلمة المرور خاطئة!"); // Incorrect password
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F1115] p-4 font-sans text-[#E0E2E5]" dir="rtl">
      <div className="w-full max-w-md rounded-xl border border-[#2D3139] bg-[#161920] p-8 shadow-2xl">
        <div className="mb-8 flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded bg-[#3498DB] font-bold text-white">
            <span className="text-2xl">R8</span>
          </div>
          <h1 className="text-2xl font-bold text-white">نظام التحكم في السيرفو درايف</h1>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-[#8E9299]">SAMKOON AUTOMATION CO.</p>
        </div>

        <div className="space-y-6">
          <button
            onClick={() => onLogin("User")}
            className="group flex w-full items-center justify-center gap-3 rounded-lg border-2 border-[#2ECC71] bg-[#1E2521] px-4 py-4 font-bold text-[#E0E2E5] transition-colors hover:bg-[#2ECC71] hover:text-[#0F1115]"
          >
            <UserCircle className="h-6 w-6" />
            <span className="uppercase tracking-widest" dir="ltr">User Mode</span>
            <span>(دخول بصلاحية عامل)</span>
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-[#2D3139]"></div>
            <span className="mx-4 flex-shrink-0 text-[10px] uppercase tracking-widest text-[#5D6D7E]">ADMIN ACCESS</span>
            <div className="flex-grow border-t border-[#2D3139]"></div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <KeyRound className="h-5 w-5 text-[#8E9299]" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="block w-full rounded border border-[#34495E] bg-[#0F1115] p-3 pr-10 font-mono text-xl text-[#3498DB] placeholder-[#5D6D7E] focus:border-[#3498DB] focus:outline-none"
                  placeholder="Admin Password"
                  dir="ltr"
                />
              </div>
              {error && (
                <div className="mt-2 flex items-center gap-1 text-sm text-[#E74C3C]">
                  <ShieldAlert className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
            
            <button
              type="submit"
              className="group flex w-full items-center justify-center gap-3 rounded-lg border-2 border-[#3498DB] bg-[#1C1F26] px-4 py-4 font-bold text-[#E0E2E5] transition-colors hover:bg-[#3498DB] hover:text-[#0F1115]"
            >
              <Settings className="h-5 w-5 transition-transform group-hover:rotate-90" />
              <span className="uppercase tracking-widest" dir="ltr">Admin Mode</span>
              <span>(دخول بصلاحية تقني)</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
