import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Client, Driver, Order, Load, Invoice, OrderStatus, PaymentStatus } from '@/types';

interface AppState {
  clients: Client[];
  drivers: Driver[];
  orders: Order[];
  loads: Load[];
  invoices: Invoice[];
  addClient: (c: Omit<Client, 'id'>) => void;
  updateClient: (c: Client) => void;
  deleteClient: (id: string) => void;
  addDriver: (d: Omit<Driver, 'id'>) => void;
  updateDriver: (d: Driver) => void;
  deleteDriver: (id: string) => void;
  addOrder: (o: Omit<Order, 'id'>) => void;
  updateOrder: (o: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  assignDriver: (orderId: string, driverId: string) => void;
  addLoad: (l: Omit<Load, 'id'>) => void;
  updateLoad: (l: Load) => void;
  addInvoice: (i: Omit<Invoice, 'id'>) => void;
  updateInvoiceStatus: (id: string, status: PaymentStatus) => void;
}

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
  { id: 'MOT-001', name: 'Pedro Lima', cnh: '12345678900', cnhCategory: 'C', phone: '(11) 98888-0001', vehicleType: 'Caminhão Baú', plate: 'ABC-1234', status: 'Disponível' },
  { id: 'MOT-002', name: 'Roberto Costa', cnh: '98765432100', cnhCategory: 'D', phone: '(11) 98888-0002', vehicleType: 'Van', plate: 'DEF-5678', status: 'Em Rota' },
  { id: 'MOT-003', name: 'Fernando Souza', cnh: '11122233344', cnhCategory: 'B', phone: '(11) 98888-0003', vehicleType: 'Fiorino', plate: 'GHI-9012', status: 'Disponível' },
];

const sampleOrders: Order[] = [
  { id: 'PED-001', clientId: 'CLI-001', date: '2026-03-01', items: [{ name: 'Produto A', quantity: 10, unitPrice: 50 }, { name: 'Produto B', quantity: 5, unitPrice: 120 }], notes: '', status: 'Entregue', driverId: 'MOT-001' },
  { id: 'PED-002', clientId: 'CLI-002', date: '2026-03-02', items: [{ name: 'Produto C', quantity: 20, unitPrice: 30 }], notes: 'Entregar pela manhã', status: 'Em Rota', driverId: 'MOT-002' },
  { id: 'PED-003', clientId: 'CLI-003', date: '2026-03-03', items: [{ name: 'Produto D', quantity: 15, unitPrice: 80 }, { name: 'Produto E', quantity: 8, unitPrice: 45 }], notes: '', status: 'Aguardando', driverId: null },
  { id: 'PED-004', clientId: 'CLI-001', date: '2026-03-04', items: [{ name: 'Produto A', quantity: 25, unitPrice: 50 }], notes: '', status: 'Separando', driverId: null },
  { id: 'PED-005', clientId: 'CLI-004', date: '2026-03-05', items: [{ name: 'Produto F', quantity: 3, unitPrice: 200 }], notes: 'Frágil', status: 'Entregue', driverId: 'MOT-003' },
  { id: 'PED-006', clientId: 'CLI-005', date: '2026-03-06', items: [{ name: 'Produto G', quantity: 50, unitPrice: 15 }], notes: '', status: 'Aguardando', driverId: null },
  { id: 'PED-007', clientId: 'CLI-002', date: '2026-03-07', items: [{ name: 'Produto H', quantity: 7, unitPrice: 300 }], notes: '', status: 'Cancelado', driverId: null },
  { id: 'PED-008', clientId: 'CLI-003', date: '2026-03-08', items: [{ name: 'Produto I', quantity: 12, unitPrice: 95 }], notes: 'Urgente', status: 'Separando', driverId: null },
];

const sampleInvoices: Invoice[] = [
  { id: 'FAT-001', clientId: 'CLI-001', orderIds: ['PED-001'], issueDate: '2026-03-02', dueDate: '2026-04-02', value: 1100, paymentMethod: 'Boleto', paymentStatus: 'Pago' },
  { id: 'FAT-002', clientId: 'CLI-004', orderIds: ['PED-005'], issueDate: '2026-03-06', dueDate: '2026-04-06', value: 600, paymentMethod: 'PIX', paymentStatus: 'Pendente' },
  { id: 'FAT-003', clientId: 'CLI-002', orderIds: ['PED-002'], issueDate: '2026-03-03', dueDate: '2026-03-08', value: 600, paymentMethod: 'Cartão', paymentStatus: 'Vencido' },
];

const sampleLoads: Load[] = [
  { id: 'CRG-001', driverId: 'MOT-002', orderIds: ['PED-002'], status: 'Em Rota', estimatedWeight: 150 },
];

let counters = { client: 5, driver: 3, order: 8, load: 1, invoice: 3 };
const nextId = (prefix: string, key: keyof typeof counters) => {
  counters[key]++;
  return `${prefix}-${String(counters[key]).padStart(3, '0')}`;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [clients, setClients] = useState<Client[]>(sampleClients);
  const [drivers, setDrivers] = useState<Driver[]>(sampleDrivers);
  const [orders, setOrders] = useState<Order[]>(sampleOrders);
  const [loads, setLoads] = useState<Load[]>(sampleLoads);
  const [invoices, setInvoices] = useState<Invoice[]>(sampleInvoices);

  const addClient = useCallback((c: Omit<Client, 'id'>) => {
    setClients(prev => [...prev, { ...c, id: nextId('CLI', 'client') }]);
  }, []);
  const updateClient = useCallback((c: Client) => {
    setClients(prev => prev.map(x => x.id === c.id ? c : x));
  }, []);
  const deleteClient = useCallback((id: string) => {
    setClients(prev => prev.filter(x => x.id !== id));
  }, []);

  const addDriver = useCallback((d: Omit<Driver, 'id'>) => {
    setDrivers(prev => [...prev, { ...d, id: nextId('MOT', 'driver') }]);
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

  const addLoad = useCallback((l: Omit<Load, 'id'>) => {
    setLoads(prev => [...prev, { ...l, id: nextId('CRG', 'load') }]);
  }, []);
  const updateLoad = useCallback((l: Load) => {
    setLoads(prev => prev.map(x => x.id === l.id ? l : x));
  }, []);

  const addInvoice = useCallback((i: Omit<Invoice, 'id'>) => {
    setInvoices(prev => [...prev, { ...i, id: nextId('FAT', 'invoice') }]);
  }, []);
  const updateInvoiceStatus = useCallback((id: string, status: PaymentStatus) => {
    setInvoices(prev => prev.map(x => x.id === id ? { ...x, paymentStatus: status } : x));
  }, []);

  return (
    <AppContext.Provider value={{
      clients, drivers, orders, loads, invoices,
      addClient, updateClient, deleteClient,
      addDriver, updateDriver, deleteDriver,
      addOrder, updateOrder, updateOrderStatus, assignDriver,
      addLoad, updateLoad,
      addInvoice, updateInvoiceStatus,
    }}>
      {children}
    </AppContext.Provider>
  );
};
