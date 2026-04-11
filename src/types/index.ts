export interface Address {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
}

export interface Client {
  id: string;
  registryNumber?: string;
  name: string;
  cpfCnpj: string;
  phone: string;
  email: string;
  address: Address;
}

export interface Driver {
  id: string;
  name: string;
  cpf?: string;
  cnh: string;
  cnhCategory: string;
  phone: string;
  vehicleType: string;
  vehicleVolume?: number;
  vehicleWeight?: number;
  plate: string;
  status: 'Disponível' | 'Em Trânsito' | 'Inativo';
}

export interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total?: number;
}

export type SupportOrderType = 'Pedido de Amostra' | 'Pedido de Reposição' | 'Pedido Treinamento';
export type SupportOrderStatus =
  | 'Aguardando Avaliação'
  | 'Liberado p/ Produção'
  | 'Em Carregamento'
  | 'Produção Concluída'
  | 'Despachado'
  | 'Em Rota'
  | 'Entregue'
  | 'Cancelado';

export interface SupportOrder {
  id: string;
  num: string;
  idNotaConf?: number;
  clientId?: string;
  clientName?: string;
  clientCode?: string;
  clientCity?: string;
  clientUF?: string;
  clienteFantasia?: string;
  pedCompraCliente?: string;
  previsaoCarregamento?: string;
  grupoCliente?: string;
  representativeId?: string;
  tipoPedido: SupportOrderType;
  representativeName: string;
  representativePhone?: string;
  date: string;
  releasedAt?: string;
  expiryDate?: string;
  items: OrderItem[];
  obs: string;
  paymentTerms?: string;
  totalPedidoVenda?: number;
  totalQtdM3?: number;
  totalQtd?: number;
  pesoLiquidoItem?: number;
  commercialNotes?: string;
  commercialDecisionNote?: string;
  history?: { at: string; by: string; action: string; note?: string }[];
  status: SupportOrderStatus;
  carregamentoId?: string;
  freightValue?: number;
}

export type OrderStatus =
  | 'Aguardando Avaliação'
  | 'Liberado p/ Produção'
  | 'Em Carregamento'
  | 'Produção Concluída'
  | 'Despachado'
  | 'Em Rota'
  | 'Entregue'
  | 'Cancelado';

export type PedidoStatusValue =
  | 'aguardando_avaliacao'
  | 'aguardando_mapeamento'
  | 'mapeamento_andamento'
  | 'mapeamento_concluido'
  | 'aguardando_ferragem'
  | 'ferragem_recebida'
  | 'liberado_comercial'
  | 'aguardando_gerencia'
  | 'confirmado_gerencia'
  | 'liberado_producao'
  | 'em_producao'
  | 'producao_finalizada'
  | 'faturado'
  | 'em_entrega'
  | 'parcialmente_entregue'
  | 'entregue'
  | 'aguardando_pagamento'
  | 'finalizado';

export type PedidoStatusKind = 'manual' | 'automatico';

export type PedidoStatusDef = {
  order: number;
  label: string;
  value: PedidoStatusValue;
  kind: PedidoStatusKind;
};

export type PedidoStatusRow = {
  id: string;
  pedido_id: string;
  numero_pedido: string;
  status_atual: PedidoStatusValue;
  atualizado_em: string;
  atualizado_por: string | null;
  criado_em: string;
};

export type PedidoStatusHistoricoRow = {
  id: string;
  pedido_id: string;
  numero_pedido: string;
  status_anterior: PedidoStatusValue | null;
  status_novo: PedidoStatusValue;
  alterado_em: string;
  alterado_por: string | null;
  observacao: string | null;
  notificado_representante: boolean;
  notificado_em: string | null;
  notificacao_provider_id: string | null;
  notificacao_erro: string | null;
};

export interface Order {
  id: string;
  idNotaConf?: number;
  clientName?: string;
  clientCode?: string;
  clientCity?: string;
  clientUF?: string;
  clienteFantasia?: string;
  pedCompraCliente?: string;
  previsaoCarregamento?: string;
  grupoCliente?: string;
  clientId: string;
  representativeId?: string; // ID do Representante
  representativeName?: string; // Nome do Representante para facilitar
  representativePhone?: string; // Telefone do Representante
  date: string;
  releasedAt?: string;
  expiryDate: string; // Validade do Pedido
  items: OrderItem[];
  notes: string;
  status: OrderStatus;
  driverId: string | null;
  freightValue?: number;
  paymentTerms?: string;
  totalPedidoVenda?: number;
  totalQtdM3?: number;
  totalQtd?: number;
  pesoLiquidoItem?: number;
  commercialNotes?: string;
  commercialDecisionNote?: string;
  carregamentoId?: string;
  history?: { at: string; by: string; action: string; note?: string }[];
}

export type ProductionScheduleStatus = 'Aguardando Início' | 'Em Produção' | 'Concluído';

export interface ProductionSchedule {
  id: string;
  num: string;
  plannedDate: string;
  obs: string;
  orderIds: string[];
  createdBy: string;
  createdAt: string;
  status: ProductionScheduleStatus;
  kind: 'CRN' | 'AVL';
}

export interface ExpenseType {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface FreightExpenseLine {
  expenseTypeId: string;
  value: number;
  note: string;
}

export type FreightEntryStatus = 'Pendente' | 'Lançado' | 'Conferido';

export interface FreightEntry {
  id: string;
  orderId: string;
  loadId?: string;
  driverId: string;
  deliveryDate: string;
  freightValue: number;
  driverValue: number;
  expenses: FreightExpenseLine[];
  status: FreightEntryStatus;
  createdAt: string;
}

export interface Load {
  id: string;
  driverId: string;
  orderIds: string[];
  plannedDate: string;
  previsaoEntrega?: string;
  obs: string;
  createdBy: string;
  createdAt: string;
  productionStatus: 'Aguardando Produção' | 'Em Produção' | 'Produção Concluída' | 'Cancelado';
  shipmentStatus: 'Aguardando Despacho' | 'Despachado' | 'Em Rota' | 'Entregue' | 'Cancelado';
  estimatedWeight: number;
  freightValue: number;
}

export type PaymentStatus = 'Pendente' | 'Pago' | 'Vencido';
export type PaymentMethod = 'Boleto' | 'PIX' | 'Cartão' | 'Dinheiro' | 'Transferência';

export interface Invoice {
  id: string;
  clientId: string;
  orderIds: string[];
  issueDate: string;
  dueDate: string;
  value: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}
