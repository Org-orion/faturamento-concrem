export const FATURADO_STATUSES = ['faturado', 'em_rota', 'entregue'] as const;
export const PROGRAMADO_STATUSES = ['aguardando_despacho', 'despachado'] as const;

function normalizeStatus(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/ /g, '_');
}

export function isFaturadoStatus(shipmentStatus: string | null | undefined): boolean {
  const n = normalizeStatus(shipmentStatus);
  return (FATURADO_STATUSES as readonly string[]).includes(n);
}

export function isProgramadoStatus(shipmentStatus: string | null | undefined): boolean {
  const n = normalizeStatus(shipmentStatus);
  return (PROGRAMADO_STATUSES as readonly string[]).includes(n);
}
