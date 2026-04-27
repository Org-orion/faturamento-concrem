import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Client,
  Driver,
  Order,
  Load,
  Invoice,
  OrderStatus,
  PaymentStatus,
  SupportOrder,
  SupportOrderStatus,
  ProductionSchedule,
  ExpenseType,
  FreightEntry,
  FreightEntryStatus,
} from '@/types';
import { UserRole, PagePermission } from '@/utils/access';
import { supabaseOps, supabasePedidos } from '@/lib/supabase';
import { rowToOrder, rowToSupportOrder } from '@/lib/pedidoMapper';
import {
  deleteProgramacaoCarregamento,
  insertProducaoConfirmacao,
  upsertEntregas,
  upsertProgramacaoCarregamento,
  listTiposDespesa,
  listLancamentosFinanceiros,
  upsertTipoDespesa,
  upsertLancamentoFinanceiro,
  deleteLancamentoFinanceiro,
  findRepresentanteContato,
  deleteCarregamentoRelatedData,
} from '@/lib/opsRepo';
import { listMotoristas } from '@/lib/cadastrosOps';
import { verifyPassword } from '@/lib/password';
import { ensurePedidosStatusInitializedBatch, listPedidosStatusByPedidoIds, setPedidoStatusWithOptionalNotify, syncEntregaStatusFromOps, updatePedidoStatus, runMigrationSuporteLiberadoProducao, resetPedidoStatusToPreEmbarque, batchSetEmEntregaForLoad } from '@/lib/pedidosStatusRepo';
import { fetchAllPages } from '@/lib/supabaseUtils';

interface AppState {
  clients: Client[];
  drivers: Driver[];
  orders: Order[];
  loads: Load[];
  invoices: Invoice[];
  users: AppUser[];
  supportOrders: SupportOrder[];
  productionSchedules: ProductionSchedule[];
  expenseTypes: ExpenseType[];
  freightEntries: FreightEntry[];
  addClient: (c: Omit<Client, 'id'>) => void;
  updateClient: (c: Client) => void;
  deleteClient: (id: string) => void;
  addDriver: (d: Driver) => void;
  updateDriver: (d: Driver) => void;
  deleteDriver: (id: string) => void;
  addOrder: (o: Omit<Order, 'id'>) => void;
  updateOrder: (o: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  assignDriver: (orderId: string, driverId: string) => void;
  addLoad: (l: Omit<Load, 'id' | 'createdAt' | 'createdBy'>) => Promise<string>;
  updateLoad: (l: Load) => Promise<void>;
  deleteLoad: (id: string) => Promise<void>;
  addInvoice: (i: Omit<Invoice, 'id'>) => void;
  updateInvoiceStatus: (id: string, status: PaymentStatus) => void;
  addSupportOrder: (o: Omit<SupportOrder, 'id' | 'num'>) => void;
  updateSupportOrder: (id: string, patch: Partial<Omit<SupportOrder, 'id' | 'num'>>) => void;
  deleteSupportOrder: (id: string) => void;
  createProductionSchedule: (data: { plannedDate: string; obs: string; orderIds: string[]; kind: 'CRN' | 'AVL' }) => void;
  updateProductionSchedule: (id: string, patch: { plannedDate?: string; obs?: string; orderIds?: string[]; status?: ProductionSchedule['status'] }) => void;
  startProductionSchedule: (id: string) => void;
  concludeProductionSchedule: (id: string) => void;
  addExpenseType: (t: Omit<ExpenseType, 'id'>) => void;
  updateExpenseType: (id: string, patch: Partial<Omit<ExpenseType, 'id'>>) => void;
  addFreightEntry: (e: Omit<FreightEntry, 'id' | 'createdAt'>) => void;
  updateFreightEntry: (id: string, patch: Partial<Omit<FreightEntry, 'id' | 'createdAt'>>) => void;
  deleteFreightEntry: (id: string) => void;
  setFreightEntryStatus: (id: string, status: FreightEntryStatus) => void;
  pedidoStatusVersion: number;
  isAuthenticated: boolean;
  user: { name: string; username: string; role: UserRole; permissions: PagePermission[] | null } | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  addUser: (u: Omit<AppUser, 'id'>) => void;
  updateUser: (id: string, patch: Partial<Omit<AppUser, 'id'>>) => void;
  deleteUser: (id: string) => void;
  updateOrderCommercialNotes: (id: string, notes: string) => void;
  decideOrderCommercial: (id: string, decision: 'Liberado p/ Produção', note?: string) => void;
  updateSupportOrderCommercialNotes: (id: string, notes: string) => void;
  decideSupportOrderCommercial: (id: string, decision: 'Liberado p/ Produção', note?: string) => void;
  allOrdersById: Map<string, Order | SupportOrder>;
  hasMoreOrders: boolean;
  loadingMoreOrders: boolean;
  loadMoreOrders: () => Promise<void>;
}

export type AppUser = { id: string; username: string; password: string; name: string; role: UserRole };

const normalizeUserPassword = (u: AppUser): AppUser => ({
  ...u,
  password: String(u.password || '').trim() || '1234',
});

const AppContext = createContext<AppState | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

const sampleClients: Client[] = [
  { id: 'CLI-001', name: 'Maria Silva', cpfCnpj: '123.456.789-00', phone: '(11) 99999-0001', email: 'maria@email.com', address: { street: 'Rua das Flores', number: '123', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zip: '01001-000' } },
  { id: 'CLI-002', name: 'João Santos', cpfCnpj: '987.654.321-00', phone: '(11) 99999-0002', email: 'joao@email.com', address: { street: 'Av. Brasil', number: '456', neighborhood: 'Jardins', city: 'São Paulo', state: 'SP', zip: '01002-000' } },
  { id: 'CLI-003', name: 'Tech Solutions LTDA', cpfCnpj: '12.345.678/0001-90', phone: '(21) 99999-0003', email: 'contato@tech.com', address: { street: 'Rua do Comércio', number: '789', neighborhood: 'Centro', city: 'Rio de Janeiro', state: 'RJ', zip: '20001-000' } },
  { id: 'CLI-004', name: 'Ana Oliveira', cpfCnpj: '111.222.333-44', phone: '(31) 99999-0004', email: 'ana@email.com', address: { street: 'Rua Minas', number: '321', neighborhood: 'Savassi', city: 'Belo Horizonte', state: 'MG', zip: '30100-000' } },
  { id: 'CLI-005', name: 'Carlos Ferreira', cpfCnpj: '555.666.777-88', phone: '(41) 99999-0005', email: 'carlos@email.com', address: { street: 'Av. Paraná', number: '654', neighborhood: 'Batel', city: 'Curitiba', state: 'PR', zip: '80200-000' } },
];

const sampleDrivers: Driver[] = [
  { id: 'MOT-001', name: 'Pedro Lima', cnh: '12345678900', cnhCategory: 'C', phone: '(11) 98888-0001', vehicleType: 'Truck Bau', vehicleVolume: 45, vehicleWeight: 12000, plate: 'ABC-1234', status: 'Disponível' },
  { id: 'MOT-002', name: 'Roberto Costa', cnh: '98765432100', cnhCategory: 'D', phone: '(11) 98888-0002', vehicleType: 'Carreta Sider', vehicleVolume: 100, vehicleWeight: 25000, plate: 'DEF-5678', status: 'Em Trânsito' },
  { id: 'MOT-003', name: 'Fernando Souza', cnh: '11122233344', cnhCategory: 'B', phone: '(11) 98888-0003', vehicleType: 'Truck Sider', vehicleVolume: 42, vehicleWeight: 11500, plate: 'GHI-9012', status: 'Disponível' },
];

const sampleOrders: Order[] = [
  { id: 'PED-001', clientId: 'CLI-001', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-01', expiryDate: '2026-03-15', items: [{ name: 'Produto A', quantity: 10, unitPrice: 50 }, { name: 'Produto B', quantity: 5, unitPrice: 120 }], notes: '', status: 'Entregue', driverId: 'MOT-001', freightValue: 100 },
  { id: 'PED-002', clientId: 'CLI-002', representativeName: 'Representante Beta', representativePhone: '(11) 97777-2222', date: '2026-03-02', expiryDate: '2026-03-16', items: [{ name: 'Produto C', quantity: 20, unitPrice: 30 }], notes: 'Entregar pela manhã', status: 'Em Rota', driverId: 'MOT-002', freightValue: 150 },
  { id: 'PED-003', clientId: 'CLI-003', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-03', expiryDate: '2026-03-17', items: [{ name: 'Produto D', quantity: 15, unitPrice: 80 }, { name: 'Produto E', quantity: 8, unitPrice: 45 }], notes: '', status: 'Aguardando Avaliação', driverId: null, freightValue: 200, paymentTerms: '30 dias' },
  { id: 'PED-004', clientId: 'CLI-001', representativeName: 'Representante Gama', representativePhone: '(11) 97777-3333', date: '2026-03-04', expiryDate: '2026-03-18', items: [{ name: 'Produto A', quantity: 25, unitPrice: 50 }], notes: '', status: 'Em Carregamento', driverId: 'MOT-002', freightValue: 120, carregamentoId: 'EMB-001' },
  { id: 'PED-005', clientId: 'CLI-004', representativeName: 'Representante Beta', representativePhone: '(11) 97777-2222', date: '2026-03-05', expiryDate: '2026-03-19', items: [{ name: 'Produto F', quantity: 3, unitPrice: 200 }], notes: 'Frágil', status: 'Entregue', driverId: 'MOT-003', freightValue: 180 },
  { id: 'PED-006', clientId: 'CLI-005', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-06', expiryDate: '2026-03-20', items: [{ name: 'Produto G', quantity: 50, unitPrice: 15 }], notes: '', status: 'Aguardando Avaliação', driverId: null, freightValue: 90, paymentTerms: 'À vista' },
  { id: 'PED-007', clientId: 'CLI-002', representativeName: 'Representante Gama', representativePhone: '(11) 97777-3333', date: '2026-03-07', expiryDate: '2026-03-21', items: [{ name: 'Produto H', quantity: 7, unitPrice: 300 }], notes: '', status: 'Cancelado', driverId: null, freightValue: 0 },
  { id: 'PED-008', clientId: 'CLI-003', representativeName: 'Representante Beta', representativePhone: '(11) 97777-2222', date: '2026-03-08', expiryDate: '2026-03-22', items: [{ name: 'Produto I', quantity: 12, unitPrice: 95 }], notes: 'Urgente', status: 'Liberado p/ Produção', driverId: null, freightValue: 250, releasedAt: '2026-03-08' },
  { id: 'PED-009', clientId: 'CLI-001', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-09', expiryDate: '2026-03-23', items: [{ name: 'Produto J', quantity: 6, unitPrice: 180 }], notes: '', status: 'Aguardando Avaliação', driverId: null, freightValue: 80, paymentTerms: '30/60/90' },
  { id: 'PED-010', clientId: 'CLI-004', representativeName: 'Representante Gama', representativePhone: '(11) 97777-3333', date: '2026-03-10', expiryDate: '2026-03-24', items: [{ name: 'Produto K', quantity: 9, unitPrice: 75 }], notes: '', status: 'Em Carregamento', driverId: 'MOT-002', freightValue: 60, paymentTerms: '30 dias', carregamentoId: 'EMB-001' },
  { id: 'PED-011', clientId: 'CLI-002', representativeName: 'Representante Beta', representativePhone: '(11) 97777-2222', date: '2026-03-11', expiryDate: '2026-03-25', items: [{ name: 'Produto L', quantity: 2, unitPrice: 450 }], notes: '', status: 'Produção Concluída', driverId: null, freightValue: 40, paymentTerms: 'À vista' },
  { id: 'PED-012', clientId: 'CLI-003', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-12', expiryDate: '2026-03-26', items: [{ name: 'Produto M', quantity: 11, unitPrice: 60 }], notes: '', status: 'Liberado p/ Produção', driverId: null, freightValue: 55, paymentTerms: '30 dias', releasedAt: '2026-03-12' },
  { id: 'PED-013', clientId: 'CLI-005', representativeName: 'Representante Gama', representativePhone: '(11) 97777-3333', date: '2026-03-13', expiryDate: '2026-03-27', items: [{ name: 'Produto N', quantity: 4, unitPrice: 210 }], notes: '', status: 'Liberado p/ Produção', driverId: null, freightValue: 90, paymentTerms: 'À vista', releasedAt: '2026-03-13' },
  { id: 'PED-014', clientId: 'CLI-001', representativeName: 'Representante Beta', representativePhone: '(11) 97777-2222', date: '2026-03-14', expiryDate: '2026-03-28', items: [{ name: 'Produto O', quantity: 7, unitPrice: 130 }], notes: '', status: 'Liberado p/ Produção', driverId: null, freightValue: 70, paymentTerms: '30 dias', releasedAt: '2026-03-14' },
  { id: 'PED-015', clientId: 'CLI-004', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-15', expiryDate: '2026-03-29', items: [{ name: 'Produto P', quantity: 3, unitPrice: 320 }], notes: '', status: 'Liberado p/ Produção', driverId: null, freightValue: 110, paymentTerms: 'À vista', releasedAt: '2026-03-15' },
  { id: 'PED-016', clientId: 'CLI-002', representativeName: 'Representante Gama', representativePhone: '(11) 97777-3333', date: '2026-03-16', expiryDate: '2026-03-30', items: [{ name: 'Produto Q', quantity: 1, unitPrice: 980 }], notes: '', status: 'Aguardando Avaliação', driverId: null, freightValue: 0, paymentTerms: '30/60/90' },
  { id: 'PED-017', clientId: 'CLI-004', representativeName: 'Representante Alfa', representativePhone: '(11) 97777-1111', date: '2026-03-06', expiryDate: '2026-03-20', items: [{ name: 'Produto R', quantity: 4, unitPrice: 150 }], notes: '', status: 'Entregue', driverId: 'MOT-001', freightValue: 140 },
  { id: 'PED-018', clientId: 'CLI-003', representativeName: 'Representante Beta', representativePhone: '(11) 97777-2222', date: '2026-03-07', expiryDate: '2026-03-21', items: [{ name: 'Produto S', quantity: 2, unitPrice: 420 }], notes: '', status: 'Entregue', driverId: 'MOT-002', freightValue: 220 },
];

const sampleInvoices: Invoice[] = [
  { id: 'FAT-001', clientId: 'CLI-001', orderIds: ['PED-001'], issueDate: '2026-03-02', dueDate: '2026-04-02', value: 1100, paymentMethod: 'Boleto', paymentStatus: 'Pago' },
  { id: 'FAT-002', clientId: 'CLI-004', orderIds: ['PED-005'], issueDate: '2026-03-06', dueDate: '2026-04-06', value: 600, paymentMethod: 'PIX', paymentStatus: 'Pendente' },
  { id: 'FAT-003', clientId: 'CLI-002', orderIds: ['PED-002'], issueDate: '2026-03-03', dueDate: '2026-03-08', value: 600, paymentMethod: 'Cartão', paymentStatus: 'Vencido' },
];

const sampleLoads: Load[] = [
  {
    id: 'EMB-001',
    driverId: 'MOT-002',
    orderIds: ['PED-004', 'PED-010'],
    plannedDate: '2026-03-12',
    obs: 'Prioridade alta',
    createdBy: 'faturamento',
    createdAt: '2026-03-10T12:00:00.000Z',
    productionStatus: 'Em Produção',
    shipmentStatus: 'Aguardando Despacho',
    estimatedWeight: 150,
    freightValue: 450,
  },
];

const sampleSupportOrders: SupportOrder[] = [
  {
    id: 'SUP-001',
    num: 'SUP-001',
    tipoPedido: 'Pedido de Amostra',
    representativeName: 'Carlos Silva',
    date: '2026-03-08',
    items: [
      { name: 'Kit Premium', quantity: 1, unitPrice: 0 },
      { name: 'Mostruário Portas', quantity: 1, unitPrice: 0 },
    ],
    obs: '',
    status: 'Aguardando Avaliação',
  },
  {
    id: 'SUP-002',
    num: 'SUP-002',
    tipoPedido: 'Pedido de Reposição',
    representativeName: 'Maria Souza',
    date: '2026-03-09',
    items: [{ name: 'Dobradiça Reforçada', quantity: 4, unitPrice: 0 }],
    obs: 'Enviar junto com a próxima rota.',
    status: 'Liberado p/ Produção',
  },
  {
    id: 'SUP-003',
    num: 'SUP-003',
    tipoPedido: 'Pedido Treinamento',
    representativeName: 'João Lima',
    date: '2026-03-10',
    items: [
      { name: 'Amostra Porta Linha X', quantity: 1, unitPrice: 0 },
      { name: 'Manual Técnico', quantity: 2, unitPrice: 0 },
    ],
    obs: '',
    status: 'Aguardando Avaliação',
  },
  {
    id: 'SUP-004',
    num: 'SUP-004',
    tipoPedido: 'Pedido de Amostra',
    representativeName: 'Carlos Silva',
    date: '2026-03-01',
    items: [{ name: 'Amostra Porta Linha Y', quantity: 1, unitPrice: 0 }],
    obs: 'Cliente final solicitou comparação.',
    status: 'Aguardando Avaliação',
  },
];

const sampleProductionSchedules: ProductionSchedule[] = [
  {
    id: 'CRN-001',
    num: 'CRN-001',
    plannedDate: '2026-03-20',
    obs: 'Priorizar pedidos urgentes.',
    orderIds: ['PED-014', 'PED-015'],
    createdBy: 'comercial',
    createdAt: '2026-03-16T10:00:00.000Z',
    status: 'Aguardando Início',
    kind: 'CRN',
  },
  {
    id: 'CRN-002',
    num: 'CRN-002',
    plannedDate: '2026-03-14',
    obs: '',
    orderIds: ['PED-010', 'PED-012', 'PED-013'],
    createdBy: 'comercial',
    createdAt: '2026-03-10T12:00:00.000Z',
    status: 'Em Produção',
    kind: 'CRN',
  },
];

const sampleExpenseTypes: ExpenseType[] = [
  { id: 'DES-001', name: 'Combustível', description: '', active: true },
  { id: 'DES-002', name: 'Pedágio', description: '', active: true },
  { id: 'DES-003', name: 'Ajudante de Carga', description: '', active: true },
  { id: 'DES-004', name: 'Alimentação', description: '', active: true },
  { id: 'DES-005', name: 'Manutenção Emergencial', description: '', active: true },
];

const sampleFreightEntries: FreightEntry[] = [
  {
    id: 'LNF-001',
    orderId: 'PED-001',
    driverId: 'MOT-001',
    deliveryDate: '2026-03-05',
    freightValue: 850,
    driverValue: 500,
    expenses: [
      { expenseTypeId: 'DES-001', value: 180, note: '' },
      { expenseTypeId: 'DES-002', value: 45, note: '' },
    ],
    status: 'Conferido',
    createdAt: '2026-03-06T10:00:00.000Z',
  },
  {
    id: 'LNF-002',
    orderId: 'PED-005',
    driverId: 'MOT-003',
    deliveryDate: '2026-03-07',
    freightValue: 600,
    driverValue: 350,
    expenses: [{ expenseTypeId: 'DES-004', value: 80, note: 'Almoço em rota' }],
    status: 'Lançado',
    createdAt: '2026-03-08T10:00:00.000Z',
  },
];

const seedUsers: AppUser[] = [
  { id: 'USR-001', username: 'admin', password: '1234', name: 'Admin', role: 'ADMIN' },
  { id: 'USR-002', username: 'faturamento', password: '1234', name: 'Faturamento', role: 'FATURAMENTO' },
  { id: 'USR-003', username: 'comercial', password: '1234', name: 'Comercial', role: 'COMERCIAL' },
  { id: 'USR-004', username: 'producao', password: '1234', name: 'Produção', role: 'PRODUCAO' },
  { id: 'USR-005', username: 'logistica', password: '1234', name: 'Logística', role: 'LOGISTICA' },
];

const counters = { client: 5, driver: 3, order: 18, load: 1, invoice: 3, support: 4, schedule: 2, expenseType: 5, freightEntry: 2 };
const nextId = (prefix: string, key: keyof typeof counters) => {
  counters[key]++;
  return `${prefix}-${String(counters[key]).padStart(3, '0')}`;
};

// Classificação por id_nota_conf exclusivamente.
// VENDA:   id_nota_conf 307 ou 309
// SUPORTE: id_nota_conf 613 ou 665
// ped_compra_cliente e valor não são critérios de classificação.
export const vendasOr = 'id_nota_conf.in.(307,309)';
export const suporteOr = 'id_nota_conf.in.(613,665)';

// Colunas usadas na listagem e em lógica de negócio (filtragem, cálculos, exibição).
// Colunas de detalhe puro (endereço completo) são buscadas sob demanda.
export const tableColumns =
  'numero_pedido, id_nota_conf, cliente_codigo, cliente_nome, data_emissao, data_validade, total_pedido_venda, total_produtos, total_qtd, total_qtd_m3, peso_liquido_item, cliente_cidade, cliente_uf, cliente_fantasia, grupo_cliente, representante, ped_compra_cliente, previsao_embarque, frete, situacao_entrega';

// Colunas de endereço — buscadas separadamente no detalhe do pedido
export const tableColumnsDetail =
  'numero_pedido, cliente_cep, cliente_endereco, cliente_bairro';

// Retorna a data de corte para o carregamento inicial (janela recente de pedidos)
export function getDataCorte(months = 4): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// Quantidade de pedidos por query na carga inicial — carrega rápido, restante via loadMoreOrders
const ORDERS_PAGE_SIZE = 200;

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [clients, setClients] = useState<Client[]>(sampleClients);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [orders, setOrders] = useState<Order[]>(sampleOrders);
  const [loads, setLoads] = useState<Load[]>(sampleLoads);
  const [pedidoStatusVersion, setPedidoStatusVersion] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>(sampleInvoices);
  const [supportOrders, setSupportOrders] = useState<SupportOrder[]>(sampleSupportOrders);
  const [productionSchedules, setProductionSchedules] = useState<ProductionSchedule[]>(sampleProductionSchedules);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [freightEntries, setFreightEntries] = useState<FreightEntry[]>([]);

  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const ordersPageRef = useRef(0); // tracks how many pages have been loaded
  // Quando mutações locais (addLoad/updateLoad/deleteLoad) alteram orders/supportOrders,
  // o batch init não precisa rodar — os pedidos já têm status. Esta flag suprime o disparo.
  const skipBatchInitRef = useRef(false);

  // Ref kept in sync with memoized Map for O(1) lookups inside stale callbacks
  const allOrdersByIdRef = useRef(new Map<string, Order | SupportOrder>());
  const allOrdersById = useMemo(() => {
    const m = new Map<string, Order | SupportOrder>();
    for (const o of orders) m.set(String(o.id), o);
    for (const o of supportOrders) m.set(String(o.id), o);
    allOrdersByIdRef.current = m;
    return m;
  }, [orders, supportOrders]);

  useEffect(() => {
    if (!supabasePedidos) return;
    let cancelled = false;

    const load = async () => {
      const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';

      const columns = tableColumns;
      const [vendasRes, suporteRes] = await Promise.all([
        supabasePedidos.from(table).select(columns).or(vendasOr)
          .gte('data_emissao', '2025-01-01')
          .order('data_emissao', { ascending: false })
          .range(0, ORDERS_PAGE_SIZE - 1)
          .then(({ data, error }) => ({ data: (data || []) as any[], error })),
        supabasePedidos.from(table).select(columns).or(suporteOr)
          .gte('data_emissao', '2025-01-01')
          .order('data_emissao', { ascending: false })
          .range(0, ORDERS_PAGE_SIZE - 1)
          .then(({ data, error }) => ({ data: (data || []) as any[], error })),
      ]);

      if (cancelled) return;
      if (vendasRes.error) console.error(`[Supabase] Falha ao carregar pedidos de venda de ${table}:`, vendasRes.error.message);
      if (suporteRes.error) console.error(`[Supabase] Falha ao carregar pedidos suporte de ${table}:`, suporteRes.error.message);

      const defaultClientId = sampleClients[0]?.id || 'CLI-001';
      const venda: Order[] = vendasRes.error ? [] : vendasRes.data.map((row: any) => rowToOrder(row, defaultClientId));
      const suporte: SupportOrder[] = suporteRes.error ? [] : suporteRes.data.map((row: any) => rowToSupportOrder(row));

      if (venda.length === 0 && suporte.length === 0) {
        const { data: fallbackData, error: fallbackErr } = await supabasePedidos.from(table).select(columns)
          .gte('data_emissao', '2025-01-01')
          .order('data_emissao', { ascending: false })
          .range(0, ORDERS_PAGE_SIZE - 1);
        if (cancelled) return;
        if (fallbackErr) { console.error(`[Supabase] Falha ao carregar fallback de ${table}:`, fallbackErr.message); return; }
        const fallbackVenda: Order[] = ((fallbackData || []) as any[]).map((row: any) => rowToOrder(row, defaultClientId));
        setOrders(fallbackVenda);
        setSupportOrders([]);
        ordersPageRef.current = 0;
        setHasMoreOrders((fallbackData?.length ?? 0) >= ORDERS_PAGE_SIZE);
        return;
      }

      if (venda.length) setOrders(venda);
      else setOrders([]);
      if (!suporteRes.error) setSupportOrders(suporte);
      ordersPageRef.current = 0;
      setHasMoreOrders(
        (vendasRes.data.length >= ORDERS_PAGE_SIZE) || (suporteRes.data.length >= ORDERS_PAGE_SIZE),
      );
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveRepPhoneRaw = useCallback(async (repIdOrName: string | null | undefined, fallback?: string | null) => {
    const direct = String(fallback || '').trim();
    if (direct) return direct;
    const key = String(repIdOrName || '').trim();
    if (!key) return null;
    try {
      const info = await findRepresentanteContato(key);
      return info?.telefone_whatsapp ? String(info.telefone_whatsapp) : null;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabaseOps) return;
    let cancelled = false;

    const loadOps = async () => {
      const { data, error } = await supabaseOps
        .from('concrem_programacoes_embarque')
        .select('id, driver_id, pedidos, planned_date, previsao_entrega, obs, criado_por, criado_em, production_status, shipment_status, estimated_weight, freight_value');
      if (cancelled) return;
      if (error || !data) {
        if (error) console.error('[Supabase OPS] Falha ao carregar programacoes_embarque:', error.message);
        return;
      }

      const mapped: Load[] = (data as any[]).map((row) => {
        const plannedDateRaw = String(row.planned_date || row.plannedDate || '').slice(0, 10);
        const previsaoEntregaRaw = String(row.previsao_entrega || '').slice(0, 10) || undefined;
        return {
          id: String(row.id),
          driverId: String(row.driver_id || row.driverId || ''),
          orderIds: Array.isArray(row.pedidos) ? row.pedidos.map(String) : Array.isArray(row.orderIds) ? row.orderIds.map(String) : [],
          plannedDate: plannedDateRaw || new Date().toISOString().slice(0, 10),
          previsaoEntrega: previsaoEntregaRaw,
          obs: String(row.obs || ''),
          createdBy: String(row.criado_por || row.createdBy || 'ops'),
          createdAt: String(row.criado_em || row.createdAt || new Date().toISOString()),
          productionStatus: (row.production_status || row.productionStatus || 'Aguardando Produção') as Load['productionStatus'],
          shipmentStatus: (row.shipment_status || row.shipmentStatus || 'Aguardando Despacho') as Load['shipmentStatus'],
          estimatedWeight: Number(row.estimated_weight ?? row.estimatedWeight ?? 0),
          freightValue: Number(row.freight_value ?? row.freightValue ?? 0),
        };
      });

      setLoads(mapped);

      // Sincronizar contador de IDs com o maior existente no banco
      for (const load of mapped) {
        const match = String(load.id).match(/^EMB-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > counters.load) counters.load = num;
        }
      }
    };

    loadOps();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDrivers = async () => {
      try {
        const opsDrivers = await listMotoristas();
        if (cancelled) return;
        const mappedDrivers: Driver[] = opsDrivers.map(d => ({
          id: d.id,
          name: d.nome || '',
          cpf: d.cpf || undefined,
          cnh: d.cnh_numero || '',
          cnhCategory: d.cnh_categoria || '',
          phone: d.telefone || '',
          vehicleType: d.tipo_veiculo || '',
          vehicleVolume: d.volume_suportado_m3 || undefined,
          vehicleWeight: d.peso_suportado_kg || undefined,
          plate: d.placa_veiculo || '',
          status: 'Disponível',
        }));
        setDrivers(mappedDrivers);
      } catch (e) {
        console.error('[Supabase OPS] Falha ao carregar motoristas:', e);
      }
    };
    loadDrivers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const toSchedule = (l: Load): ProductionSchedule => {
      const status =
        l.productionStatus === 'Em Produção' ? 'Em Produção' : l.productionStatus === 'Produção Concluída' ? 'Concluído' : 'Aguardando Início';
      return {
        id: l.id,
        num: l.id,
        plannedDate: l.plannedDate,
        obs: l.obs || '',
        orderIds: l.orderIds,
        createdBy: l.createdBy,
        createdAt: l.createdAt,
        status: status as ProductionSchedule['status'],
        kind: 'CRN',
      };
    };

    setProductionSchedules((prev) => {
      const avulsos = prev.filter((s) => s.kind === 'AVL');
      const derived = loads.map(toSchedule);
      return [...derived, ...avulsos];
    });
  }, [loads]);

  useEffect(() => {
    let cancelled = false;
    const loadFinanceiro = async () => {
      try {
        const [tipos, lancamentos] = await Promise.all([
          listTiposDespesa(),
          listLancamentosFinanceiros()
        ]);
        if (cancelled) return;
        setExpenseTypes(tipos);
        setFreightEntries(lancamentos);
      } catch (e) {
        console.error('[Supabase OPS] Falha ao carregar financeiro:', e);
      }
    };
    loadFinanceiro();
    return () => {
      cancelled = true;
    };
  }, []);

  const [users, setUsers] = useState<AppUser[]>(() => {
    const raw = localStorage.getItem('app_users');
    if (!raw) return seedUsers;
    try {
      const parsed = JSON.parse(raw) as AppUser[];
      if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeUserPassword);
      return seedUsers;
    } catch {
      return seedUsers;
    }
  });

  const persistUsers = useCallback((next: AppUser[]) => {
    const normalized = next.map(normalizeUserPassword);
    setUsers(normalized);
    localStorage.setItem('app_users', JSON.stringify(normalized));
  }, []);
  
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('auth_token') === 'true';
  });
  const [user, setUser] = useState<{ name: string; username: string; role: UserRole; permissions: PagePermission[] | null } | null>(() => {
    const savedUser = sessionStorage.getItem('auth_user');
    if (!savedUser) return null;
    try {
      const parsed = JSON.parse(savedUser) as { name?: string; username?: string; role?: UserRole; permissions?: PagePermission[] | null };
      if (parsed && parsed.username) {
        return {
          name: parsed.name || parsed.username,
          username: parsed.username,
          role: parsed.role || 'ADMIN',
          permissions: Array.isArray(parsed.permissions) ? parsed.permissions : null,
        };
      }
      return null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username: string, password: string) => {
    if (supabaseOps) {
      try {
        const { data, error } = await supabaseOps
          .from('concrem_usuarios')
          .select('*')
          .eq('email', username)
          .eq('ativo', true)
          .single();

        if (!error && data) {
          const isValid = await verifyPassword(password, data.senha_hash);
          if (isValid) {
            setIsAuthenticated(true);
            const roleMap: Record<string, UserRole> = {
              administrador: 'ADMIN',
              faturamento: 'FATURAMENTO',
              producao: 'PRODUCAO',
              comercial: 'COMERCIAL',
              logistica: 'LOGISTICA',
            };
            const role = roleMap[data.perfil_acesso] || 'COMERCIAL';
            const permissions: PagePermission[] | null =
              Array.isArray(data.paginas_acesso) && data.paginas_acesso.length > 0
                ? (data.paginas_acesso as PagePermission[])
                : null;
            const newUser = { name: data.nome, username: data.email, role, permissions };
            setUser(newUser);
            sessionStorage.setItem('auth_token', 'true');
            sessionStorage.setItem('auth_user', JSON.stringify(newUser));
            return true;
          }
        }
      } catch (err) {
        console.error('Supabase login error', err);
      }
    }

    const found = users.find((u) => u.username === username && u.password === password);
    if (!found) return false;

    setIsAuthenticated(true);
    const newUser = { name: found.name, username: found.username, role: found.role, permissions: null as PagePermission[] | null };
    setUser(newUser);
    sessionStorage.setItem('auth_token', 'true');
    sessionStorage.setItem('auth_user', JSON.stringify(newUser));
    return true;
  }, [users]);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_user');
  }, []);

  useEffect(() => {
    if (!supabaseOps) return;
    if (skipBatchInitRef.current) { skipBatchInitRef.current = false; return; }
    const payload = [
      ...(orders || []).map((o) => ({ pedidoId: o.id, numeroPedido: o.id, grupoCliente: o.grupoCliente, clienteNome: o.clientName || o.clientCode, representanteNome: o.representativeName })),
      ...(supportOrders || []).map((o) => ({ pedidoId: o.id, numeroPedido: o.id, grupoCliente: o.grupoCliente, clienteNome: o.clientName || o.clientCode, representanteNome: o.representativeName })),
    ];
    ensurePedidosStatusInitializedBatch(payload, user?.username || null).then(({ upgradedCount }) => {
      if (upgradedCount > 0) setPedidoStatusVersion((v) => v + 1);
    });
  }, [orders, supportOrders, user?.username]);

  // One-time migration: bulk set known suporte orders to liberado_producao
  useEffect(() => {
    if (!supabaseOps) return;
    const MIGRATION_KEY = 'migration_suporte_liberado_producao_v1';
    if (localStorage.getItem(MIGRATION_KEY)) return;

    const SUPORTE_IDS = [
      '86977','86916','104469','112923','112375','112788','112919','112943','113497','113694',
      '113714','113868','112093','114870','114407','115013','114958','115423','115334','115687',
      '116142','115823','116205','113964','116838','116837','116760','116455','116992','117671',
      '117702','119774','119083','120228','120315','120869','83292','83783','83934','92853',
      '97724','102637','101545','112085','112434','112324','112893','113413','113707','113698',
      '113545','115112','115044','103987','115634','105809','116192','115419','115630','116203',
      '116916','116487','107450','117142','117518','117223','117750','117408','117267','117885',
      '117546','117181','117732','114091','114113','113985','113987','117257','118100','119758',
      '120232','120025','120242','120475','120334','119150','120848','120491','121115','121411',
      '121121','121321','122343','122239','122179','122104','121342','121469','121551','120027',
      '121648','121647','121649','121646','121671','121535','121689','121711','121154','121408',
      '121763','114998','121007','121059','121116','121080','121106','122776','121731','121974',
      '117246','121267','121056','122421','121972','119221','118670','122460','121497','120624',
      '120660','119128','124369','124404','114320','114323','107768','124060','124035','124090',
      '124307','122024','122544','122519','120407','123144','118361','122572','107802','122983',
      '120220','10Z460','122693','123277','122466','101346','122559','124074','122785','113164',
      '122484','124638','124630','126035','124592','125235','125418','124634','118668','124471',
      '122366','125745','118394','126246','126373','126224','124445','124593','125615','126002',
      '47640','125735','125995','124644','124790','124916','125525','124557','125928','125915',
      '125894','125833','126055','125854','127629','127199','127489','127148','127509','128451',
      '128457','128580','128095','128121','128180','127682','127582','127320','122719','126709',
      '126030','127640','127126','128640','128039','127857','126372','128322','126950','128162',
      '127118','128440','128488','128676','128675','128261','1280701','128072','83511','83780',
      '93434','95750','118203','119377','120076','122656','121440','120054','122227','121911',
      '124421','125120','124881','125862','125505','126618','125266','126057',
    ];

    runMigrationSuporteLiberadoProducao(SUPORTE_IDS, user?.username || null).then((count) => {
      localStorage.setItem(MIGRATION_KEY, '1');
      if (count > 0) setPedidoStatusVersion((v) => v + 1);
      console.log(`[Migration] ${MIGRATION_KEY}: ${count} pedidos atualizados para liberado_producao`);
    });
  }, [user?.username]);

  const addUser = useCallback(
    (u: Omit<AppUser, 'id'>) => {
      const idNum = users.reduce((max, cur) => {
        const n = Number(String(cur.id || '').replace(/\D/g, ''));
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);
      const next: AppUser = {
        ...u,
        password: String((u as any).password || '').trim() || '1234',
        id: `USR-${String(idNum + 1).padStart(3, '0')}`,
      };
      persistUsers([...users, next]);
    },
    [persistUsers, users],
  );

  const updateUser = useCallback(
    (id: string, patch: Partial<Omit<AppUser, 'id'>>) => {
      const safePatch: Partial<Omit<AppUser, 'id'>> = { ...patch };
      if ('password' in safePatch) {
        const nextPass = String((safePatch as any).password || '').trim();
        if (!nextPass) delete (safePatch as any).password;
        else (safePatch as any).password = nextPass;
      }
      const next = users.map((u) => (u.id === id ? { ...u, ...safePatch } : u));
      persistUsers(next);

      const updated = next.find((u) => u.id === id);
      if (updated && user && updated.username === user.username) {
        const sessionUser = { name: updated.name, username: updated.username, role: updated.role };
        setUser(sessionUser);
        localStorage.setItem('auth_user', JSON.stringify(sessionUser));
      }
    },
    [persistUsers, user, users],
  );

  const deleteUser = useCallback(
    (id: string) => {
      const deleting = users.find((u) => u.id === id);
      const next = users.filter((u) => u.id !== id);
      persistUsers(next);

      if (deleting && user && deleting.username === user.username) {
        logout();
      }
    },
    [logout, persistUsers, user, users],
  );

  const appendHistory = useCallback((order: Order, by: string, action: string, note?: string): Order => {
    const entry = { at: new Date().toISOString(), by, action, note };
    return { ...order, history: [...(order.history || []), entry] };
  }, []);

  const updateOrderCommercialNotes = useCallback(
    (id: string, notes: string) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const next = { ...o, commercialNotes: notes };
          return user ? appendHistory(next, user.username, 'Atualizou observações (Comercial)') : next;
        }),
      );
    },
    [appendHistory, user],
  );

  const decideOrderCommercial = useCallback(
    (id: string, decision: 'Liberado p/ Produção', note?: string) => {
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const base: Order = {
            ...o,
            status: decision,
            releasedAt: decision === 'Liberado p/ Produção' ? new Date().toISOString().split('T')[0] : o.releasedAt,
            commercialDecisionNote: note,
          };
          if (!user) return base;

          return appendHistory(base, user.username, 'Liberou pedido para produção', note);
        }),
      );

      const o = allOrdersByIdRef.current.get(String(id)) as Order | undefined;
      const clienteNome = o?.clientName || o?.clientCode || 'Cliente';
      const repKey = String(o?.representativeId || o?.representativeName || '').trim();
      void (async () => {
        const repPhone = await resolveRepPhoneRaw(repKey, o?.representativePhone || null);
        await setPedidoStatusWithOptionalNotify({
          pedidoId: id,
          numeroPedido: id,
          statusNovo: 'liberado_producao',
          alteradoPor: user?.username || null,
          observacao: note || null,
          notifyRepresentante: true,
          representantePhoneRaw: repPhone,
          clienteNome,
        });
      })();
    },
    [appendHistory, resolveRepPhoneRaw, user?.username],
  );

  const appendSupportHistory = useCallback((order: SupportOrder, by: string, action: string, note?: string): SupportOrder => {
    const entry = { at: new Date().toISOString(), by, action, note };
    return { ...order, history: [...(order.history || []), entry] };
  }, []);

  const updateSupportOrderCommercialNotes = useCallback(
    (id: string, notes: string) => {
      setSupportOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const next = { ...o, commercialNotes: notes };
          return user ? appendSupportHistory(next, user.username, 'Atualizou observações (Comercial)') : next;
        }),
      );
    },
    [appendSupportHistory, user],
  );

  const decideSupportOrderCommercial = useCallback(
    (id: string, decision: 'Liberado p/ Produção', note?: string) => {
      setSupportOrders((prev) =>
        prev.map((o) => {
          if (o.id !== id) return o;
          const base: SupportOrder = {
            ...o,
            status: decision,
            releasedAt: decision === 'Liberado p/ Produção' ? new Date().toISOString().split('T')[0] : o.releasedAt,
            commercialDecisionNote: note,
          };
          if (!user) return base;

          return appendSupportHistory(base, user.username, 'Liberou pedido para produção', note);
        }),
      );

      const o = allOrdersByIdRef.current.get(String(id)) as SupportOrder | undefined;
      const clienteNome = o?.clientName || o?.clientCode || 'Cliente';
      const repKey = String(o?.representativeId || o?.representativeName || '').trim();
      void (async () => {
        const repPhone = await resolveRepPhoneRaw(repKey, o?.representativePhone || null);
        await setPedidoStatusWithOptionalNotify({
          pedidoId: id,
          numeroPedido: id,
          statusNovo: 'liberado_producao',
          alteradoPor: user?.username || null,
          observacao: note || null,
          notifyRepresentante: true,
          representantePhoneRaw: repPhone,
          clienteNome,
        });
      })();
    },
    [appendSupportHistory, resolveRepPhoneRaw, user?.username],
  );

  const loadMoreOrders = useCallback(async () => {
    if (!supabasePedidos || loadingMoreOrders || !hasMoreOrders) return;
    setLoadingMoreOrders(true);
    const nextPage = ordersPageRef.current + 1;
    const from = nextPage * ORDERS_PAGE_SIZE;
    const to = from + ORDERS_PAGE_SIZE - 1;
    const table = import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema';
    const defaultClientId = sampleClients[0]?.id || 'CLI-001';
    try {
      const [vendasRes, suporteRes] = await Promise.all([
        supabasePedidos.from(table).select(tableColumns).or(vendasOr)
          .gte('data_emissao', '2025-01-01').order('data_emissao', { ascending: false }).range(from, to)
          .then(({ data, error }) => ({ data: (data || []) as any[], error })),
        supabasePedidos.from(table).select(tableColumns).or(suporteOr)
          .gte('data_emissao', '2025-01-01').order('data_emissao', { ascending: false }).range(from, to)
          .then(({ data, error }) => ({ data: (data || []) as any[], error })),
      ]);
      const newVenda = vendasRes.error ? [] : vendasRes.data.map((r: any) => rowToOrder(r, defaultClientId));
      const newSuporteRows = suporteRes.error ? [] : suporteRes.data.map((r: any) => rowToSupportOrder(r));
      setOrders((prev) => {
        const ids = new Set(prev.map((o) => o.id));
        return [...prev, ...newVenda.filter((o) => !ids.has(o.id))];
      });
      setSupportOrders((prev) => {
        const ids = new Set(prev.map((o) => o.id));
        return [...prev, ...newSuporteRows.filter((o) => !ids.has(o.id))];
      });
      ordersPageRef.current = nextPage;
      setHasMoreOrders(
        (vendasRes.data.length >= ORDERS_PAGE_SIZE) || (suporteRes.data.length >= ORDERS_PAGE_SIZE),
      );
    } catch (e) {
      console.error('[AppContext] loadMoreOrders error:', e);
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [loadingMoreOrders, hasMoreOrders]);

  const addClient = useCallback((c: Omit<Client, 'id'>) => {
    setClients(prev => [...prev, { ...c, id: nextId('CLI', 'client') }]);
  }, []);
  const updateClient = useCallback((c: Client) => {
    setClients(prev => prev.map(x => x.id === c.id ? c : x));
  }, []);
  const deleteClient = useCallback((id: string) => {
    setClients(prev => prev.filter(x => x.id !== id));
  }, []);

  const addDriver = useCallback((d: Driver) => {
    setDrivers(prev => [...prev, d]);
  }, []);
  const updateDriver = useCallback((d: Driver) => {
    setDrivers(prev => prev.map(x => x.id === d.id ? d : x));
  }, []);
  const deleteDriver = useCallback((id: string) => {
    setDrivers(prev => prev.filter(x => x.id !== id));
  }, []);

  const addOrder = useCallback((o: Omit<Order, 'id'>) => {
    setOrders(prev => [...prev, { ...o, id: nextId('PED', 'order') }]);
  }, []);
  const updateOrder = useCallback((o: Order) => {
    setOrders(prev => prev.map(x => x.id === o.id ? o : x));
  }, []);
  const updateOrderStatus = useCallback((id: string, status: OrderStatus) => {
    setOrders(prev => prev.map(x => x.id === id ? { ...x, status } : x));
  }, []);
  const assignDriver = useCallback((orderId: string, driverId: string) => {
    setOrders(prev => prev.map(x => x.id === orderId ? { ...x, driverId } : x));
  }, []);

  const mapLoadToOrderStatus = useCallback((l: Load): OrderStatus => {
    if (l.shipmentStatus === 'Entregue') return 'Entregue';
    if (l.shipmentStatus === 'Em Rota') return 'Em Rota';
    if (l.shipmentStatus === 'Despachado') return 'Despachado';
    if (l.productionStatus === 'Produção Concluída') return 'Produção Concluída';
    return 'Em Carregamento';
  }, []);

  const addLoad = useCallback(async (l: Omit<Load, 'id' | 'createdAt' | 'createdBy'>) => {
    const newLoadId = nextId('EMB', 'load');
    const createdAt = new Date().toISOString();
    const createdBy = user?.username || 'faturamento';
    const nextLoad: Load = { ...l, id: newLoadId, createdAt, createdBy };
    setLoads((prev) => [...prev, nextLoad]);

    skipBatchInitRef.current = true;
    setOrders((prev) =>
      prev.map((o) =>
        l.orderIds.includes(o.id)
          ? {
              ...o,
              driverId: l.driverId,
              carregamentoId: newLoadId,
              status: mapLoadToOrderStatus(nextLoad),
            }
          : o,
      ),
    );

    setSupportOrders((prev) =>
      prev.map((o) =>
        l.orderIds.includes(o.id)
          ? {
              ...o,
              carregamentoId: newLoadId,
              status: mapLoadToOrderStatus(nextLoad) as SupportOrderStatus,
            }
          : o,
      ),
    );

    setDrivers((prev) =>
      prev.map((d) =>
        d.id === l.driverId ? { ...d, status: nextLoad.shipmentStatus === 'Entregue' ? 'Disponível' : 'Em Trânsito' } : d,
      ),
    );

    const { error: saveErr } = await upsertProgramacaoCarregamento(nextLoad);
    if (saveErr) throw new Error(`Erro ao salvar carregamento: ${saveErr.message}`);
    await upsertEntregas(nextLoad.id, nextLoad.orderIds, 'pendente');

    if (nextLoad.shipmentStatus === 'Em Rota') {
      const currentStatuses = await listPedidosStatusByPedidoIds(nextLoad.orderIds);
      const statusMap = new Map(currentStatuses.map((s) => [String(s.pedido_id), s.status_atual as PedidoStatusValue]));
      const ordersForBatch = await Promise.all(
        nextLoad.orderIds.map(async (pedidoId) => {
          const o: any = allOrdersByIdRef.current.get(pedidoId);
          const clienteNome = o?.clientName || o?.clientCode || 'Cliente';
          const repKey = String(o?.representativeId || o?.representativeName || '').trim();
          const repPhone = await resolveRepPhoneRaw(repKey, o?.representativePhone || null);
          return { pedidoId, numeroPedido: pedidoId, statusAtual: statusMap.get(pedidoId) || null, clienteNome, representantePhoneRaw: repPhone };
        }),
      );
      await batchSetEmEntregaForLoad(ordersForBatch, user?.username || null);
    }

    return newLoadId;
  }, [mapLoadToOrderStatus, orders, resolveRepPhoneRaw, supportOrders, user?.username]);

  const updateLoad = useCallback(async (l: Load) => {
    const oldLoad = loads.find(x => x.id === l.id);
    setLoads(prev => prev.map(x => x.id === l.id ? l : x));

    skipBatchInitRef.current = true;
    setOrders((prev) =>
      prev.map((o) => {
        if (l.orderIds.includes(o.id)) {
          return { ...o, driverId: l.driverId, carregamentoId: l.id, status: mapLoadToOrderStatus(l) };
        }
        if (oldLoad?.orderIds.includes(o.id)) {
          const { carregamentoId, ...rest } = o;
          return { ...rest, driverId: null, status: 'Liberado p/ Produção' };
        }
        return o;
      }),
    );

    setSupportOrders((prev) =>
      prev.map((o) => {
        if (l.orderIds.includes(o.id)) {
          return { ...o, carregamentoId: l.id, status: mapLoadToOrderStatus(l) as SupportOrderStatus };
        }
        if (oldLoad?.orderIds.includes(o.id)) {
          const { carregamentoId, ...rest } = o;
          return { ...rest, status: 'Liberado p/ Produção' };
        }
        return o;
      }),
    );

    // Sincronizar motorista
    setDrivers(prev => prev.map(d => {
      // Motorista da carga atual
      if (d.id === l.driverId) {
        return { ...d, status: l.shipmentStatus === 'Entregue' ? 'Disponível' : 'Em Trânsito' };
      }
      // Se o motorista foi trocado, o antigo fica disponível (se não tiver outras cargas em rota)
      if (oldLoad && oldLoad.driverId !== l.driverId && d.id === oldLoad.driverId) {
        // Verifica se o motorista antigo tem outras cargas ativas
        const hasOtherActiveLoads = loads.some(load => 
          load.id !== l.id && 
          load.driverId === oldLoad.driverId && 
          load.shipmentStatus !== 'Entregue' && load.shipmentStatus !== 'Cancelado'
        );
        if (!hasOtherActiveLoads) {
          return { ...d, status: 'Disponível' };
        }
      }
      return d;
    }));

    const { error: saveErr } = await upsertProgramacaoCarregamento(l);
    if (saveErr) throw new Error(`Erro ao salvar carregamento: ${saveErr.message}`);
    await upsertEntregas(l.id, l.orderIds, l.shipmentStatus === 'Entregue' ? 'entregue' : 'pendente');

    if (l.shipmentStatus === 'Em Rota') {
      const currentStatuses = await listPedidosStatusByPedidoIds(l.orderIds);
      const statusMap = new Map(currentStatuses.map((s) => [String(s.pedido_id), s.status_atual as PedidoStatusValue]));
      const ordersForBatch = await Promise.all(
        l.orderIds.map(async (pedidoId) => {
          const o: any = allOrdersByIdRef.current.get(pedidoId);
          const clienteNome = o?.clientName || o?.clientCode || 'Cliente';
          const repKey = String(o?.representativeId || o?.representativeName || '').trim();
          const repPhone = await resolveRepPhoneRaw(repKey, o?.representativePhone || null);
          return { pedidoId, numeroPedido: pedidoId, statusAtual: statusMap.get(pedidoId) || null, clienteNome, representantePhoneRaw: repPhone };
        }),
      );
      await batchSetEmEntregaForLoad(ordersForBatch, user?.username || null);
    }

    // Só sincroniza status de entrega quando o carregamento transiciona para "Entregue"
    const virouEntregue = l.shipmentStatus === 'Entregue' && oldLoad?.shipmentStatus !== 'Entregue';
    if (virouEntregue) {
      await Promise.all(
        l.orderIds.map(async (pedidoId) => {
          const o: any = allOrdersByIdRef.current.get(pedidoId);
          const clienteNome = o?.clientName || o?.clientCode || 'Cliente';
          const repKey = String(o?.representativeId || o?.representativeName || '').trim();
          const repPhone = await resolveRepPhoneRaw(repKey, o?.representativePhone || null);
          await syncEntregaStatusFromOps({
            pedidoId,
            numeroPedido: pedidoId,
            alteradoPor: user?.username || null,
            clienteNome,
            representantePhoneRaw: repPhone,
          });
        }),
      );
    }
  }, [loads, mapLoadToOrderStatus, orders, resolveRepPhoneRaw, supportOrders, user?.username]);

  const deleteLoad = useCallback(async (id: string) => {
    const load = loads.find(x => x.id === id);
    if (!load) return;

    skipBatchInitRef.current = true;
    // Resetar pedidos localmente
    setOrders(prev => prev.map(o =>
      load.orderIds.includes(o.id)
        ? (() => {
            const { carregamentoId, ...rest } = o;
            return { ...rest, driverId: null, status: 'Liberado p/ Produção' };
          })()
        : o
    ));

    setSupportOrders((prev) =>
      prev.map((o) =>
        load.orderIds.includes(o.id)
          ? (() => {
              const { carregamentoId, ...rest } = o;
              return { ...rest, status: 'Liberado p/ Produção' };
            })()
          : o,
      ),
    );

    // Reset status dos pedidos: apaga histórico pós-produção e reverte status atual
    await Promise.all(
      load.orderIds.map((pedidoId) =>
        resetPedidoStatusToPreEmbarque(pedidoId, 'sistema')
          .catch((e) => console.error('[deleteLoad] reset status error', pedidoId, e)),
      ),
    );

    // Limpa anexos, notificações, lançamentos financeiros e produção concluída
    await deleteCarregamentoRelatedData(id)
      .catch((e) => console.error('[deleteLoad] deleteCarregamentoRelatedData error', e));

    setPedidoStatusVersion((v) => v + 1);

    // Liberar motorista se não tiver outras cargas ativas
    const hasOtherActiveLoads = loads.some(l =>
      l.id !== id &&
      l.driverId === load.driverId &&
      l.shipmentStatus !== 'Entregue' && l.shipmentStatus !== 'Cancelado'
    );

    if (!hasOtherActiveLoads) {
      setDrivers(prev => prev.map(d =>
        d.id === load.driverId
          ? { ...d, status: 'Disponível' }
          : d
      ));
    }

    setLoads(prev => prev.filter(x => x.id !== id));

    await deleteProgramacaoCarregamento(id);
  }, [loads]);

  const addInvoice = useCallback((i: Omit<Invoice, 'id'>) => {
    setInvoices(prev => [...prev, { ...i, id: nextId('FAT', 'invoice') }]);
  }, []);
  const updateInvoiceStatus = useCallback((id: string, status: PaymentStatus) => {
    setInvoices(prev => prev.map(x => x.id === id ? { ...x, paymentStatus: status } : x));
  }, []);

  const addSupportOrder = useCallback((o: Omit<SupportOrder, 'id' | 'num'>) => {
    const num = nextId('SUP', 'support');
    setSupportOrders((prev) => [...prev, { ...o, id: num, num }]);
  }, []);

  const updateSupportOrder = useCallback((id: string, patch: Partial<Omit<SupportOrder, 'id' | 'num'>>) => {
    setSupportOrders((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const deleteSupportOrder = useCallback((id: string) => {
    setSupportOrders((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const createProductionSchedule = useCallback((data: { plannedDate: string; obs: string; orderIds: string[]; kind: 'CRN' | 'AVL' }) => {
    const num = nextId(data.kind, 'schedule');
    const schedule: ProductionSchedule = {
      id: num,
      num,
      plannedDate: data.plannedDate,
      obs: data.obs,
      orderIds: data.orderIds,
      createdBy: user?.username || 'admin',
      createdAt: new Date().toISOString(),
      status: 'Aguardando Início',
      kind: data.kind,
    };
    setProductionSchedules((prev) => [schedule, ...prev]);
  }, [user?.username]);

  const startProductionSchedule = useCallback((id: string) => {
    const schedule = productionSchedules.find((s) => s.id === id);
    if (!schedule) return;

    setProductionSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'Em Produção' } : s)));

    setLoads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, productionStatus: 'Em Produção' as const };
        void upsertProgramacaoCarregamento(next);
        if (user?.username) {
          void insertProducaoConfirmacao(id, user.username);
        }
        return next;
      }),
    );

    const orderIds = schedule.orderIds || [];
    void Promise.all(
      orderIds.map(async (pedidoId) => {
        const o = allOrdersByIdRef.current.get(pedidoId);
        const clienteNome = (o as any)?.clientName || (o as any)?.clientCode || 'Cliente';
        await setPedidoStatusWithOptionalNotify({
          pedidoId,
          numeroPedido: pedidoId,
          statusNovo: 'em_producao',
          alteradoPor: user?.username || null,
          observacao: null,
          notifyRepresentante: false,
          representantePhoneRaw: null,
          clienteNome,
        });
      }),
    );
  }, [orders, productionSchedules, supportOrders, user?.username]);

  const concludeProductionSchedule = useCallback((id: string) => {
    const schedule = productionSchedules.find((s) => s.id === id);
    if (!schedule) return;

    setProductionSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'Concluído' } : s)));

    setLoads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, productionStatus: 'Produção Concluída' as const };
        void upsertProgramacaoCarregamento(next);
        return next;
      }),
    );

    const orderIds = schedule.orderIds || [];
    void Promise.all(
      orderIds.map(async (pedidoId) => {
        const o = allOrdersByIdRef.current.get(pedidoId);
        const clienteNome = (o as any)?.clientName || (o as any)?.clientCode || 'Cliente';
        await setPedidoStatusWithOptionalNotify({
          pedidoId,
          numeroPedido: pedidoId,
          statusNovo: 'producao_finalizada',
          alteradoPor: user?.username || null,
          observacao: null,
          notifyRepresentante: false,
          representantePhoneRaw: null,
          clienteNome,
        });
      }),
    );
  }, [orders, productionSchedules, supportOrders, user?.username]);

  const updateProductionSchedule = useCallback(
    (id: string, patch: { plannedDate?: string; obs?: string; orderIds?: string[] }) => {
      const schedule = productionSchedules.find((s) => s.id === id);
      if (!schedule) return;

      const nextOrderIds = patch.orderIds ?? schedule.orderIds;
      const removed = schedule.orderIds.filter((x) => !nextOrderIds.includes(x));
      const added = nextOrderIds.filter((x) => !schedule.orderIds.includes(x));

      setProductionSchedules((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                plannedDate: patch.plannedDate ?? s.plannedDate,
                obs: patch.obs ?? s.obs,
                orderIds: nextOrderIds,
              }
            : s,
        ),
      );
    },
    [productionSchedules],
  );

  const addExpenseType = useCallback((t: Omit<ExpenseType, 'id'>) => {
    const newType = { ...t, id: nextId('DES', 'expenseType') };
    setExpenseTypes((prev) => [...prev, newType]);
    void upsertTipoDespesa(newType);
  }, []);

  const updateExpenseType = useCallback((id: string, patch: Partial<Omit<ExpenseType, 'id'>>) => {
    setExpenseTypes((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x));
      const updated = next.find((x) => x.id === id);
      if (updated) void upsertTipoDespesa(updated);
      return next;
    });
  }, []);

  const addFreightEntry = useCallback((e: Omit<FreightEntry, 'id' | 'createdAt'>) => {
    const num = nextId('LNF', 'freightEntry');
    const entry: FreightEntry = { ...e, id: num, createdAt: new Date().toISOString() };
    setFreightEntries((prev) => [entry, ...prev]);
    void upsertLancamentoFinanceiro(entry);
  }, []);

  const updateFreightEntry = useCallback((id: string, patch: Partial<Omit<FreightEntry, 'id' | 'createdAt'>>) => {
    setFreightEntries((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x));
      const updated = next.find((x) => x.id === id);
      if (updated) void upsertLancamentoFinanceiro(updated);
      return next;
    });
  }, []);

  const deleteFreightEntry = useCallback((id: string) => {
    setFreightEntries((prev) => prev.filter((x) => x.id !== id));
    void deleteLancamentoFinanceiro(id);
  }, []);

  const setFreightEntryStatus = useCallback((id: string, status: FreightEntryStatus) => {
    const entry = freightEntries.find(x => x.id === id);
    setFreightEntries((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, status } : x));
      const updated = next.find((x) => x.id === id);
      if (updated) void upsertLancamentoFinanceiro(updated);
      return next;
    });
    // Conferido → todos os pedidos do carregamento recebem Finalizado
    if (status === 'Conferido' && entry) {
      const load = entry.loadId ? loads.find(l => l.id === entry.loadId) : null;
      const orderIds = load ? load.orderIds : [entry.orderId];
      for (const oid of orderIds) {
        void updatePedidoStatus({
          pedidoId: oid,
          numeroPedido: oid,
          statusNovo: 'finalizado',
          alteradoPor: null,
          observacao: 'Lançamento de frete conferido',
        });
      }
    }
  }, [freightEntries, loads]);

  return (
    <AppContext.Provider value={{
      clients, drivers, orders, loads, invoices, users,
      supportOrders, productionSchedules, expenseTypes, freightEntries,
      addClient, updateClient, deleteClient,
      addDriver, updateDriver, deleteDriver,
      addOrder, updateOrder, updateOrderStatus, assignDriver,
      pedidoStatusVersion,
      addLoad, updateLoad, deleteLoad,
      addInvoice, updateInvoiceStatus,
      addSupportOrder, updateSupportOrder, deleteSupportOrder,
      createProductionSchedule, updateProductionSchedule, startProductionSchedule, concludeProductionSchedule,
      addExpenseType, updateExpenseType,
      addFreightEntry, updateFreightEntry, deleteFreightEntry, setFreightEntryStatus,
      isAuthenticated, user, login, logout,
      addUser, updateUser, deleteUser,
      updateOrderCommercialNotes, decideOrderCommercial,
      updateSupportOrderCommercialNotes, decideSupportOrderCommercial,
      allOrdersById,
      hasMoreOrders,
      loadingMoreOrders,
      loadMoreOrders,
    }}>
      {children}
    </AppContext.Provider>
  );
};
