import React from 'react';
import { Order, OrderItem, OrderStatus } from '@/types';

export const statusColors: Record<OrderStatus, string> = {
  'Aguardando Avaliação': 'bg-status-warning/15 text-status-warning',
  'Liberado p/ Produção': 'bg-status-success/15 text-status-success',
  'Em Carregamento': 'bg-status-info/15 text-status-info',
  'Produção Concluída': 'bg-status-success/15 text-status-success',
  'Despachado': 'bg-status-info/15 text-status-info',
  'Em Rota': 'bg-status-info/15 text-status-info',
  'Entregue': 'bg-status-success/15 text-status-success',
  'Cancelado': 'bg-destructive/10 text-destructive',
};

export const paymentStatusColors: Record<string, string> = {
  'Pendente': 'bg-status-warning/15 text-status-warning',
  'Pago': 'bg-status-success/15 text-status-success',
  'Vencido': 'bg-destructive/10 text-destructive',
};

export const driverStatusColors: Record<string, string> = {
  'Disponível': 'bg-status-success/15 text-status-success',
  'Em Trânsito': 'bg-status-info/15 text-status-info',
  'Inativo': 'bg-muted text-muted-foreground',
};

export const loadStatusColors: Record<string, string> = {
  'Aguardando Produção': 'bg-muted text-muted-foreground',
  'Em Produção': 'bg-status-warning/15 text-status-warning',
  'Produção Concluída': 'bg-status-success/15 text-status-success',
  'Aguardando Despacho': 'bg-muted text-muted-foreground',
  'Despachado': 'bg-status-info/15 text-status-info',
  'Em Rota': 'bg-status-warning/15 text-status-warning',
  'Entregue': 'bg-status-success/15 text-status-success',
  'Cancelado': 'bg-destructive/10 text-destructive',
};

export const StatusBadge = ({ status, colorMap }: { status: string; colorMap: Record<string, string> }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium font-display ${colorMap[status] || 'bg-muted text-muted-foreground'}`}>
    {status}
  </span>
);

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const getOrderTotal = (order: { items: OrderItem[]; totalPedidoVenda?: number | null }) => {
  if (typeof order.totalPedidoVenda === 'number' && Number.isFinite(order.totalPedidoVenda)) return order.totalPedidoVenda;
  return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
};

export const FormField = ({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium font-display text-foreground">{label}</label>
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

export const inputClass = "w-full px-3 py-2 rounded-lg border border-input bg-card text-foreground font-display text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors";

export const btnPrimary = "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-display text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity";

export const btnSecondary = "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-display text-sm font-medium hover:bg-border active:opacity-80 transition-colors";

export const btnDanger = "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground font-display text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity";
