import React from 'react';
import { PedidoStatusValue } from '@/types';
import { getPedidoStatusBadgeClass, getPedidoStatusLabel } from '@/lib/pedidoStatusFlow';

export function PedidoStatusBadge({ value, className }: { value: PedidoStatusValue; className?: string }) {
  return (
    <span className={['inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold', getPedidoStatusBadgeClass(value), className || ''].join(' ')}>
      {getPedidoStatusLabel(value)}
    </span>
  );
}

