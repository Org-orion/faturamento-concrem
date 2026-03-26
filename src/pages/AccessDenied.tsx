import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';

const AccessDenied = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md w-full bg-card border border-border rounded-xl shadow-card p-6 text-center">
        <div className="mx-auto mb-4 size-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldX className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-bold font-sans text-foreground">Acesso não autorizado</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Você não tem permissão para acessar esta seção.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-semibold"
          >
            Ir ao Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;

