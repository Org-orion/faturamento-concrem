import React from 'react';
import Modal from '@/components/Modal';
import { TriangleAlert } from 'lucide-react';
import type { PedidoElegivel } from '@/lib/protocoloFinanceiro';

type Props = {
  open: boolean;
  numeroProtocolo: string;
  pedidos: PedidoElegivel[];
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const ProtocoloPreview: React.FC<Props> = ({ open, numeroProtocolo, pedidos, loading, onClose, onConfirm }) => {
  return (
    <Modal open={open} onClose={onClose} title={`Confirmar Protocolo ${numeroProtocolo}`} wide>
      <div className="space-y-5">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-sm font-bold font-display">{pedidos.length} pedido(s) neste protocolo</p>
          </div>
          <div className="overflow-auto max-h-[340px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2.5 px-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Cliente</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Pedido</th>
                  <th className="text-left py-2.5 px-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">NF-e</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pedidos.map((p) => (
                  <tr key={p.pedidoId}>
                    <td className="py-2.5 px-4 font-display font-medium">{p.nomeCliente || '—'}</td>
                    <td className="py-2.5 px-4 font-mono-data font-bold text-primary">{p.pedidoId}</td>
                    <td className="py-2.5 px-4 font-mono-data">{p.numeroNota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Atenção:</strong> após gerado, esses pedidos não poderão ser incluídos em novo protocolo sem aprovação do administrador.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-semibold disabled:opacity-50"
          >
            {loading ? 'Gerando...' : 'Confirmar e Gerar PDF'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProtocoloPreview;
