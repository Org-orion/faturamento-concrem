import { PedidoStatusRow } from '@/types';

export type UnifiedPedido = {
  id: string;
  numero: string;
  cliente: string;
  representante: string;
  repPhone?: string | null;
};

export type PedidoStatusById = Map<string, PedidoStatusRow>;

