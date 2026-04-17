import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PedidoStatusValue } from '@/types';
import { formatStatusWhatsappMessage, setPedidoStatusWithOptionalNotify, isLeroy } from '@/lib/pedidosStatusRepo';
import { getNextManualStatuses } from '@/lib/pedidoStatusFlow';
import { findRepresentanteContato } from '@/lib/opsRepo';

export function StatusUpdateDialog({
  open,
  onOpenChange,
  pedido,
  statusAtual,
  userName,
  onSaved,
  onNotifyResult,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedido: { id: string; numero: string; cliente: string; representante?: string; repPhone?: string | null } | null;
  statusAtual: PedidoStatusValue | null;
  userName: string | null;
  onSaved: (newStatus?: PedidoStatusValue) => Promise<void>;
  onNotifyResult: (res: { attempted: boolean; ok: boolean; error: string | null }) => void;
}) {
  const [novoStatus, setNovoStatus] = useState<PedidoStatusValue | ''>('');
  const [obs, setObs] = useState('');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolvedPhone, setResolvedPhone] = useState<string | null>(null);
  const [dataAlteracao, setDataAlteracao] = useState(() => new Date().toISOString().slice(0, 10));

  const manualOptions = useMemo(() => {
    if (!statusAtual) return [];
    return getNextManualStatuses(statusAtual);
  }, [statusAtual]);

  useEffect(() => {
    if (!open || !pedido) return;
    setNovoStatus('');
    setObs('');
    setResolvedPhone(null);
    setDataAlteracao(new Date().toISOString().slice(0, 10));

    // Buscar telefone do cadastro de representantes
    const repName = pedido.representante || '';
    void (async () => {
      let contact = repName ? await findRepresentanteContato(repName) : null;
      const phone = contact?.telefone || pedido.repPhone || null;
      setResolvedPhone(phone);
      setNotify(Boolean(phone));
    })();
  }, [open, pedido?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewMessage = useMemo(() => {
    if (!pedido || !statusAtual || !novoStatus) return '';
    return formatStatusWhatsappMessage({
      numeroPedido: pedido.numero,
      clienteNome: pedido.cliente,
      statusAnterior: statusAtual,
      statusNovo: novoStatus,
      dataHoraIso: new Date().toISOString(),
      observacao: obs,
    });
  }, [novoStatus, obs, pedido, statusAtual]);

  const save = async () => {
    if (!pedido || !statusAtual) return;
    if (!novoStatus) return;

    setSaving(true);
    try {
      const leroy = isLeroy(pedido.cliente, pedido.representante);
      const shouldNotify = Boolean(notify) && !leroy;

      const today = new Date().toISOString().slice(0, 10);
      const alteradoEm = dataAlteracao
        ? dataAlteracao === today
          ? new Date().toISOString()
          : new Date(dataAlteracao + 'T12:00:00').toISOString()
        : undefined;

      const res = await setPedidoStatusWithOptionalNotify({
        pedidoId: pedido.id,
        numeroPedido: pedido.numero,
        statusNovo: novoStatus,
        alteradoPor: userName,
        alteradoEm: alteradoEm ?? null,
        observacao: obs || null,
        notifyRepresentante: shouldNotify,
        representantePhoneRaw: resolvedPhone || pedido.repPhone || null,
        representanteNome: pedido.representante || null,
        clienteNome: pedido.cliente,
      });

      onNotifyResult({ attempted: shouldNotify, ok: res.notified, error: res.notifyError });

      if (!res.ok) return;
      await onSaved(novoStatus);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl">
        <div className="p-6 border-b border-border">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-bold text-foreground">Atualizar Status</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Selecione o novo status manual e registre uma observação (opcional).</DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Novo status</Label>
              <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as PedidoStatusValue)}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {manualOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data da alteração</Label>
              <input
                type="date"
                value={dataAlteracao}
                onChange={(e) => setDataAlteracao(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Notificar representante?</Label>
              <div className="h-10 rounded-lg border border-border bg-white px-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">WhatsApp</div>
                <Switch checked={notify} onCheckedChange={setNotify} />
              </div>
              {resolvedPhone
                ? <div className="text-[11px] text-muted-foreground">{resolvedPhone}</div>
                : <div className="text-[11px] text-muted-foreground">Representante sem telefone cadastrado.</div>
              }
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" className="bg-white min-h-[90px]" />
          </div>

          {notify && novoStatus && (
            <div className="rounded-xl border border-border bg-muted/10 p-4">
              <div className="text-xs font-bold uppercase tracking-tight text-muted-foreground">Prévia da mensagem</div>
              <pre className="mt-3 text-sm whitespace-pre-wrap font-sans text-foreground/90">{previewMessage}</pre>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !novoStatus}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
