import { PedidoStatusRow } from '@/types';

export type UnifiedPedido = {
  id: string;
  numero: string;
  cliente: string;
  representante: string;
  valor: number;
};

export type PedidoStatusById = Map<string, PedidoStatusRow>;

