import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { btnPrimary, btnSecondary, inputClass } from '@/components/shared';

type Props = {
  open: boolean;
  quantidadePedidos: number;
  mesProgramacao: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  quantidadeProgramados?: number;
  mesProgramacaoExistente?: string | null;
};

const YYYYMM_RE = /^\d{4}-\d{2}$/;

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function fmtMes(yyyymm: string): string {
  const [year, month] = yyyymm.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1] || month}/${year}`;
}

export const ConfirmarLiberacaoModal: React.FC<Props> = ({
  open,
  quantidadePedidos,
  mesProgramacao,
  onChange,
  onCancel,
  onConfirm,
  loading = false,
  quantidadeProgramados = 0,
  mesProgramacaoExistente = null,
}) => {
  if (!open) return null;

  const invalid = mesProgramacao !== '' && !YYYYMM_RE.test(mesProgramacao);
  const canConfirm = !invalid && !loading;

  const titulo =
    quantidadePedidos === 1
      ? 'Liberar Pedido para Produção'
      : `Liberar ${quantidadePedidos} Pedidos para Produção`;

  const warningText = quantidadeProgramados > 0
    ? quantidadePedidos === 1
      ? `Este pedido já está programado${mesProgramacaoExistente ? ` para ${fmtMes(mesProgramacaoExistente)}` : ''}. Altere apenas se necessário.`
      : `${quantidadeProgramados} pedido(s) já possuem mês de programação${mesProgramacaoExistente ? ` (${fmtMes(mesProgramacaoExistente)})` : ''}. Altere apenas se necessário.`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <h2 className="text-lg font-bold font-display text-foreground">{titulo}</h2>

        {warningText && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-xs">{warningText}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Mês de Programação
          </label>
          <input
            type="month"
            value={mesProgramacao}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            autoFocus
          />
          {invalid && (
            <p className="text-xs text-destructive">Formato inválido. Selecione um mês válido.</p>
          )}
          {!mesProgramacao && (
            <p className="text-xs text-muted-foreground">Selecione o mês de programação para esses pedidos.</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button className={btnSecondary} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            className={btnPrimary}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            <CheckCircle2 className="h-4 w-4" />
            {loading ? 'Liberando…' : 'Confirmar Liberação'}
          </button>
        </div>
      </div>
    </div>
  );
};
