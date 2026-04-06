import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import { User, Lock, ArrowRight, Loader2 } from 'lucide-react';
import logo from '@/assets/logo.png';
import loginBg from '@/assets/wallpaper-concrem.jpg';
import { getHomePathForRole, UserRole } from '@/utils/access';

const Login = () => {
  const { login } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!username.trim() || !password.trim()) {
      setError('Preencha usuário e senha');
      setIsLoading(false);
      return;
    }

    const ok = await login(username.trim(), password.trim());
    if (!ok) {
      setError('Usuário ou senha inválidos');
      setIsLoading(false);
      return;
    }

    let role: UserRole = 'ADMIN';
    let permissions = null;
    try {
      const saved = sessionStorage.getItem('auth_user');
      const parsed = saved ? (JSON.parse(saved) as { role?: UserRole; permissions?: import('@/utils/access').PagePermission[] | null }) : null;
      if (parsed?.role) role = parsed.role;
      if (Array.isArray(parsed?.permissions)) permissions = parsed.permissions;
    } catch {
      role = 'ADMIN';
    }
    navigate(getHomePathForRole(role, permissions));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div 
        className="absolute inset-0 bg-cover bg-center z-0" 
        style={{ backgroundImage: `url(${loginBg})` }}
      />
      <div className="absolute inset-0 bg-black/60 z-0 backdrop-blur-[2px]" />
      
      <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden relative z-10 border border-white/20">
        <div className="p-8 md:p-10">
          <div className="flex justify-center mb-8">
            <img src={logo} alt="Concrem Logo" className="h-20 object-contain" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium font-display text-[#0a2315] ml-1">Usuário</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-muted/30 focus:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a2315]/20 focus:border-[#0a2315]"
                    placeholder="Digite seu usuário"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium font-display text-[#0a2315] ml-1">Senha</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Lock className="h-5 w-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-muted/30 focus:bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#0a2315]/20 focus:border-[#0a2315]"
                    placeholder="Digite sua senha"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium text-center animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0a2315] text-white py-3.5 rounded-xl font-bold font-display uppercase tracking-wide hover:bg-[#0a2315]/90 transition-all shadow-lg shadow-[#0a2315]/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
        </div>
        <div className="bg-muted/30 p-4 text-center border-t border-border">
          <p className="text-xs text-muted-foreground font-medium">
            &copy; {new Date().getFullYear()} Concrem. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
