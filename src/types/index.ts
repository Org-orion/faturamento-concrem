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
  name: string;
  cpfCnpj: string;
  phone: string;
  email: string;
  address: Address;
}

export interface Driver {
  id: string;
  name: string;
  cnh: string;
  cnhCategory: string;
  phone: string;
  vehicleType: string;
  plate: string;
  status: 'Disponível' | 'Em Rota' | 'Inativo';
}

export interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export type OrderStatus = 'Aguardando' | 'Separando' | 'Em Rota' | 'Entregue' | 'Cancelado';

export interface Order {
  id: string;
  clientId: string;
  date: string;
  items: OrderItem[];
  notes: string;
  status: OrderStatus;
  driverId: string | null;
}

export interface Load {
  id: string;
  driverId: string;
  orderIds: string[];
  status: 'Aguardando Saída' | 'Em Rota' | 'Finalizada';
  estimatedWeight: number;
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
