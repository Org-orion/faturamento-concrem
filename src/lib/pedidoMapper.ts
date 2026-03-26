import { Order, OrderItem, OrderStatus, SupportOrder, SupportOrderStatus, SupportOrderType } from '@/types';

type Row = Record<string, any>;

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

const pickString = (row: Row, keys: string[]) => {
  for (const k of keys) {
    const v = row[k];
    if (isNonEmptyString(v)) return v;
  }
  return '';
};

const pickNumber = (row: Row, keys: string[]) => {
  for (const k of keys) {
    const v = row[k];
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const pickDate = (row: Row, keys: string[], fallback: string) => {
  const v = pickString(row, keys);
  if (!v) return fallback;
  return v.slice(0, 10);
};

const parseNumberLike = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let s = v.trim();
  if (!s) return NaN;
  s = s.replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const toItemKV = (it: any) => {
  const kv: Record<string, any> = {};
  if (!it || typeof it !== 'object') return kv;
  for (const [k, v] of Object.entries(it)) kv[String(k).toLowerCase()] = v;
  return kv;
};

const pickItemString = (kv: Record<string, any>, keys: string[]) => {
  for (const k of keys) {
    const v = kv[k];
    if (isNonEmptyString(v)) return v;
  }
  return '';
};

const pickItemNumber = (kv: Record<string, any>, keys: string[]) => {
  for (const k of keys) {
    const n = parseNumberLike(kv[k]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const looksLikeItemsArray = (arr: unknown[]) => {
  for (let i = 0; i < Math.min(arr.length, 10); i++) {
    const it = arr[i] as any;
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const kv = toItemKV(it);
    const name = pickItemString(kv, [
      'name',
      'produto',
      'descricao',
      'item',
      'produto_nome',
      'descricao_produto',
      'desc_produto',
      'nome_produto',
    ]);
    const qty = pickItemNumber(kv, ['quantity', 'qtd', 'qtde', 'quantidade', 'quantidade_item', 'qtd_item', 'qtde_item']);
    const unit = pickItemNumber(kv, [
      'unitprice',
      'valor_un',
      'valor_unit',
      'valor_unitario',
      'preco',
      'preco_unit',
      'preco_unitario',
      'vlr_un',
      'vlr_unit',
    ]);
    const total = pickItemNumber(kv, ['total', 'valor_total', 'vlr_total', 'valor_total_item', 'total_item']);
    if (name || qty > 0 || unit > 0 || total > 0) return true;
  }
  return false;
};

const findItemsArray = (value: unknown): unknown[] | null => {
  if (!value) return null;
  if (Array.isArray(value)) return looksLikeItemsArray(value) ? value : null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return findItemsArray(parsed);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object') return null;

  const queue: unknown[] = [value];
  const visited = new Set<any>();
  let steps = 0;

  while (queue.length && steps < 1200) {
    const cur = queue.shift();
    steps++;

    if (!cur) continue;
    if (Array.isArray(cur)) {
      if (looksLikeItemsArray(cur)) return cur;
      for (let i = 0; i < Math.min(cur.length, 25); i++) queue.push(cur[i]);
      continue;
    }
    if (typeof cur !== 'object') continue;
    if (visited.has(cur)) continue;
    visited.add(cur);

    for (const [kRaw, v] of Object.entries(cur as any)) {
      const k = String(kRaw).toLowerCase();
      if (
        Array.isArray(v) &&
        (k === 'itens' ||
          k === 'items' ||
          k === 'produtos' ||
          k === 'produto' ||
          k === 'pedido_itens' ||
          k === 'itens_pedido' ||
          k === 'itensdopedsido' ||
          k === 'itenspedido')
      ) {
        const found = findItemsArray(v);
        if (found) return found;
      }
      if (v && (typeof v === 'object' || Array.isArray(v) || typeof v === 'string')) queue.push(v);
    }
  }
  return null;
};

const normalizeItems = (value: unknown): OrderItem[] => {
  const arr = findItemsArray(value);
  if (!arr) return [];
  return arr
    .map((it: any) => {
      const kv = toItemKV(it);
      const name =
        pickItemString(kv, [
          'name',
          'produto',
          'descricao',
          'item',
          'produto_nome',
          'descricao_produto',
          'desc_produto',
          'nome_produto',
        ]) || '';
      const quantity = pickItemNumber(kv, [
        'quantity',
        'qtd',
        'qtde',
        'quantidade',
        'quantidade_item',
        'qtd_item',
        'qtde_item',
      ]);
      const unitPrice = pickItemNumber(kv, [
        'unitprice',
        'valor_un',
        'valor_unit',
        'valor_unitario',
        'preco',
        'preco_unit',
        'preco_unitario',
        'vlr_un',
        'vlr_unit',
      ]);
      const total = pickItemNumber(kv, ['total', 'valor_total', 'vlr_total', 'valor_total_item', 'total_item']);
      return { name, quantity, unitPrice, total: Number.isFinite(total) ? total : undefined } as OrderItem;
    })
    .filter((it) => isNonEmptyString(it.name));
};

const isOrderStatus = (v: unknown): v is OrderStatus => {
  return [
    'Aguardando Avaliação',
    'Liberado p/ Produção',
    'Em Carregamento',
    'Produção Concluída',
    'Despachado',
    'Em Rota',
    'Entregue',
    'Cancelado',
  ].includes(String(v));
};

const isSupportStatus = (v: unknown): v is SupportOrderStatus => {
  return [
    'Aguardando Avaliação',
    'Liberado p/ Produção',
    'Em Carregamento',
    'Produção Concluída',
    'Despachado',
    'Em Rota',
    'Entregue',
    'Cancelado',
  ].includes(String(v));
};

const isSupportType = (v: unknown): v is SupportOrderType => {
  return ['Pedido de Amostra', 'Pedido de Reposição', 'Pedido Treinamento'].includes(String(v));
};

export function rowToOrder(row: Row, defaultClientId: string): Order {
  const today = new Date().toISOString().slice(0, 10);
  const id = pickString(row, ['numero_pedido', 'num', 'numero', 'pedido', 'codigo', 'id', 'pedido_id']);
  const clientId = pickString(row, ['client_id', 'cliente_id', 'id_cliente', 'clientId', 'clienteId']) || defaultClientId;
  const driverIdRaw = pickString(row, ['driver_id', 'motorista_id', 'driverId', 'motoristaId']);
  const statusRaw = row.status ?? row.status_pedido ?? row.situacao;
  const status: OrderStatus = isOrderStatus(statusRaw) ? statusRaw : 'Aguardando Avaliação';
  const items = normalizeItems(row.dados_tabela ?? row.items ?? row.itens ?? row.produtos);
  const totalPedidoVenda = pickNumber(row, ['total_pedido_venda', 'total', 'total_pedido', 'valor_total']);
  const totalQtdM3 = pickNumber(row, ['total_qtd_m3', 'totalQtdM3', 'qtd_m3', 'volume_m3']);
  const idNotaConf = pickNumber(row, ['id_nota_conf', 'idNotaConf']);

  return {
    id: id || `PED-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    idNotaConf: idNotaConf || undefined,
    clientName: pickString(row, ['cliente_nome', 'nome_cliente', 'client_name', 'clientName']) || undefined,
    clientCode: pickString(row, ['cliente_codigo', 'codigo_cliente', 'client_code', 'clientCode']) || undefined,
    clientCity: pickString(row, ['cliente_cidade', 'cidade_cliente', 'client_city', 'clientCity']) || undefined,
    clientUF: pickString(row, ['cliente_UF', 'cliente_uf', 'uf_cliente', 'client_uf', 'clientUF']) || undefined,
    clienteFantasia: pickString(row, ['cliente_fantasia', 'fantasia_cliente', 'clienteFantasia']) || undefined,
    pedCompraCliente: pickString(row, ['ped_compra_cliente', 'pedido_compra_cliente', 'pedCompraCliente']) || undefined,
    previsaoCarregamento: pickString(row, ['precisao_embarque', 'previsao_embarque', 'previsaoCarregamento']) || undefined,
    grupoCliente: pickString(row, ['grupo_cliente', 'grupoCliente']) || undefined,
    clientId,
    representativeId: pickString(row, ['representative_id', 'representante_id', 'id_representante', 'representativeId', 'representanteId']) || undefined,
    representativeName: pickString(row, ['representative_name', 'representante', 'representante_nome', 'nome_representante', 'representativeName']) || undefined,
    representativePhone: pickString(row, ['representative_phone', 'representante_fone', 'representante_telefone', 'telefone_representante', 'representativePhone']) || undefined,
    date: pickDate(row, ['data_emissao', 'date', 'data', 'data_pedido', 'created_at', 'createdAt'], today),
    releasedAt: pickDate(row, ['released_at', 'data_liberacao', 'releasedAt'], ''),
    expiryDate: pickDate(row, ['data_validade', 'expiry_date', 'validade', 'validade_pedido', 'expiryDate'], today),
    items,
    notes: pickString(row, ['notes', 'obs', 'observacao', 'observacoes']) || '',
    status,
    driverId: driverIdRaw || null,
    freightValue: pickNumber(row, ['freight_value', 'valor_frete', 'freightValue', 'frete']),
    paymentTerms: pickString(row, ['payment_terms', 'condicao_pagamento', 'paymentTerms']) || undefined,
    totalPedidoVenda: totalPedidoVenda || undefined,
    totalQtdM3: totalQtdM3 || undefined,
    commercialNotes: pickString(row, ['commercial_notes', 'obs_comercial', 'commercialNotes']) || undefined,
    commercialDecisionNote: pickString(row, ['commercial_decision_note', 'nota_decisao', 'commercialDecisionNote']) || undefined,
    carregamentoId: pickString(row, ['embarque_id', 'load_id', 'carregamentoId', 'loadId']) || undefined,
    history: Array.isArray(row.history) ? row.history : undefined,
  };
}

export function rowToSupportOrder(row: Row): SupportOrder {
  const today = new Date().toISOString().slice(0, 10);
  const id = pickString(row, ['numero_pedido', 'num', 'numero', 'pedido', 'codigo', 'id', 'pedido_id']);
  const tipoRaw = row.tipoPedido ?? row.tipo_pedido ?? row.tipo ?? row.tipo_pedido_suporte;
  const tipoPedido: SupportOrderType = isSupportType(tipoRaw) ? tipoRaw : 'Pedido de Amostra';
  const statusRaw = row.status ?? row.status_pedido ?? row.situacao;
  const status: SupportOrderStatus = isSupportStatus(statusRaw) ? statusRaw : 'Aguardando Avaliação';
  const totalPedidoVenda = pickNumber(row, ['total_pedido_venda', 'total', 'total_pedido', 'valor_total']);
  const totalQtdM3 = pickNumber(row, ['total_qtd_m3', 'totalQtdM3', 'qtd_m3', 'volume_m3']);
  const idNotaConf = pickNumber(row, ['id_nota_conf', 'idNotaConf']);

  return {
    id: id || `SUP-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    num: pickString(row, ['numero_pedido', 'num', 'numero', 'pedido']) || id || '',
    idNotaConf: idNotaConf || undefined,
    clientId: pickString(row, ['client_id', 'cliente_id', 'id_cliente', 'clientId', 'clienteId']) || undefined,
    clientName: pickString(row, ['cliente_nome', 'nome_cliente', 'client_name', 'clientName']) || undefined,
    clientCode: pickString(row, ['cliente_codigo', 'codigo_cliente', 'client_code', 'clientCode']) || undefined,
    clientCity: pickString(row, ['cliente_cidade', 'cidade_cliente', 'client_city', 'clientCity']) || undefined,
    clientUF: pickString(row, ['cliente_UF', 'cliente_uf', 'uf_cliente', 'client_uf', 'clientUF']) || undefined,
    clienteFantasia: pickString(row, ['cliente_fantasia', 'fantasia_cliente', 'clienteFantasia']) || undefined,
    pedCompraCliente: pickString(row, ['ped_compra_cliente', 'pedido_compra_cliente', 'pedCompraCliente']) || undefined,
    previsaoCarregamento: pickString(row, ['precisao_embarque', 'previsao_embarque', 'previsaoCarregamento']) || undefined,
    grupoCliente: pickString(row, ['grupo_cliente', 'grupoCliente']) || undefined,
    representativeId: pickString(row, ['representative_id', 'representante_id', 'id_representante', 'representativeId', 'representanteId']) || undefined,
    tipoPedido,
    representativeName: pickString(row, ['representative_name', 'representante', 'representante_nome', 'nome_representante', 'representativeName']) || '-',
    representativePhone: pickString(row, ['representative_phone', 'representante_fone', 'representante_telefone', 'telefone_representante', 'representativePhone']) || undefined,
    date: pickDate(row, ['data_emissao', 'date', 'data', 'data_pedido', 'created_at', 'createdAt'], today),
    expiryDate: pickDate(row, ['data_validade', 'expiry_date', 'validade', 'validade_pedido', 'expiryDate'], ''),
    releasedAt: pickDate(row, ['released_at', 'data_liberacao', 'releasedAt'], ''),
    items: normalizeItems(row.dados_tabela ?? row.items ?? row.itens ?? row.produtos),
    obs: pickString(row, ['obs', 'observacao', 'observacoes', 'notes']) || '',
    freightValue: pickNumber(row, ['freight_value', 'valor_frete', 'freightValue', 'frete']),
    paymentTerms: pickString(row, ['payment_terms', 'condicao_pagamento', 'paymentTerms']) || undefined,
    totalPedidoVenda: totalPedidoVenda || undefined,
    totalQtdM3: totalQtdM3 || undefined,
    commercialNotes: pickString(row, ['commercial_notes', 'obs_comercial', 'commercialNotes']) || undefined,
    commercialDecisionNote: pickString(row, ['commercial_decision_note', 'nota_decisao', 'commercialDecisionNote']) || undefined,
    history: Array.isArray(row.history) ? row.history : undefined,
    status,
    carregamentoId: pickString(row, ['embarque_id', 'load_id', 'carregamentoId', 'loadId']) || undefined,
  };
}
