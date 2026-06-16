import React from 'react';
import { Download, Ban } from 'lucide-react';
import type { ProtocoloComPedidos } from '@/lib/protocoloFinanceiro';
import { fmtDateTime } from '@/lib/dateUtils';

type Props = {
  protocolos: ProtocoloComPedidos[];
  loading: boolean;
  isAdmin: boolean;
  baixandoId: string | null;
  cancelandoId: string | null;
  onBaixarPdf: (p: ProtocoloComPedidos) => void;
  onCancelar: (p: ProtocoloComPedidos) => void;
};

export const HistoricoProtocolos: React.FC<Props> = ({
  protocolos, loading, isAdmin, baixandoId, cancelandoId, onBaixarPdf, onCancelar,
}) => {
  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Nº Protocolo</th>
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Data/Hora</th>
              <th className="text-left py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Criado por</th>
              <th className="text-center py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Qtd Pedidos</th>
              <th className="text-center py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Status</th>
              <th className="text-right py-3 px-4 font-display font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground font-display">Carregando protocolos...</td></tr>
            ) : protocolos.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground font-display">Nenhum protocolo gerado ainda.</td></tr>
            ) : (
              protocolos.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono-data font-bold text-primary">{p.numero_protocolo}</td>
                  <td className="py-3 px-4 font-mono-data text-muted-foreground">{fmtDateTime(p.criado_em)}</td>
                  <td className="py-3 px-4 font-display">{p.criado_por_nome || p.criado_por || '—'}</td>
                  <td className="py-3 px-4 text-center font-mono-data font-bold">{p.pedidos.length}</td>
                  <td className="py-3 px-4 text-center">
                    {p.status === 'cancelado' ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-100">Cancelado</span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Ativo</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => onBaixarPdf(p)}
                        disabled={baixandoId === p.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 transition-all font-display text-xs font-bold uppercase tracking-tight shadow-sm disabled:opacity-50"
                      >
                        <Download className="h-3 w-3" />
                        {baixandoId === p.id ? 'Gerando...' : 'Baixar PDF'}
                      </button>
                      {isAdmin && p.status === 'ativo' && (
                        <button
                          onClick={() => onCancelar(p)}
                          disabled={cancelandoId === p.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-200 bg-card text-red-600 hover:bg-red-50 transition-all font-display text-xs font-bold uppercase tracking-tight shadow-sm disabled:opacity-50"
                        >
                          <Ban className="h-3 w-3" />
                          Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoricoProtocolos;
