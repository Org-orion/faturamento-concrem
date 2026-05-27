// ─── Funcionalidade keys ────────────────────────────────────────────────────

export type Funcionalidade =
  // Dashboard
  | 'dashboard.view'

  // Pedidos de Venda
  | 'comercial.view'
  | 'comercial.detalhes'
  | 'comercial.atualizar_status'
  | 'comercial.liberar_gerencia'
  | 'comercial.confirmar_gerencia'
  | 'comercial.exportar_pdf_gerencia'
  | 'comercial.liberar_producao'
  | 'comercial.exportar_pdf_programacao'
  | 'comercial.mover_suporte'

  // Pedidos de Suporte
  | 'suporte.view'
  | 'suporte.detalhes'
  | 'suporte.atualizar_status'
  | 'suporte.liberar_producao'
  | 'suporte.mover_vendas'

  // Produção
  | 'producao.view'
  | 'producao.criar_avulsa'
  | 'producao.iniciar'
  | 'producao.concluir'
  | 'producao.reverter'
  | 'producao.desfazer_conclusao'
  | 'producao.imprimir'

  // Carregamento
  | 'carregamento.view'
  | 'carregamento.criar_editar'
  | 'carregamento.excluir'
  | 'carregamento.cronograma'
  | 'carregamento.dashboard'

  // Financeiro
  | 'financeiro.view'
  | 'financeiro.criar_editar'
  | 'financeiro.excluir'
  | 'financeiro.marcar_lancado_conferido'
  | 'financeiro.imprimir'
  | 'financeiro.gerenciar_tipos'

  // Atualização de Status
  | 'atualizacao_status.view'
  | 'atualizacao_status.atualizar'

  // Prioridades
  | 'prioridades.view'
  | 'prioridades.gerenciar'

  // Programação Comercial
  | 'programacao_comercial.view'
  | 'programacao_comercial.editar_mes'
  | 'programacao_comercial.sincronizar'

  // Painel de Pedidos
  | 'painel_pedidos.view'

  // Painel TV
  | 'painel_tv.view'

  // Análise de Pedidos
  | 'analise_pedidos.view'

  // Representantes
  | 'representantes.view'
  | 'representantes.criar_editar'
  | 'representantes.excluir'

  // Motoristas
  | 'motoristas.view'
  | 'motoristas.criar_editar'
  | 'motoristas.excluir'
  | 'motoristas.avaliar'
  | 'motoristas.blacklist'

  // Usuários
  | 'usuarios.view'
  | 'usuarios.criar_editar'
  | 'usuarios.excluir'
  | 'usuarios.gerenciar_grupos';

// ─── Labels ─────────────────────────────────────────────────────────────────

export const funcionalidadeLabels: Record<Funcionalidade, string> = {
  'dashboard.view':                     'Visualizar dashboard',

  'comercial.view':                     'Visualizar pedidos de venda',
  'comercial.detalhes':                 'Ver detalhes e histórico',
  'comercial.atualizar_status':         'Atualizar status manualmente',
  'comercial.liberar_gerencia':         'Enviar para gerência',
  'comercial.confirmar_gerencia':       'Confirmar aprovação da gerência',
  'comercial.exportar_pdf_gerencia':    'Exportar PDF para gerência',
  'comercial.liberar_producao':         'Liberar para produção',
  'comercial.exportar_pdf_programacao': 'Exportar PDF de programação',
  'comercial.mover_suporte':            'Mover pedido para Suporte',

  'suporte.view':           'Visualizar pedidos de suporte',
  'suporte.detalhes':       'Ver detalhes e histórico',
  'suporte.atualizar_status': 'Atualizar status manualmente',
  'suporte.liberar_producao': 'Liberar para produção',
  'suporte.mover_vendas':   'Mover pedido para Vendas',

  'producao.view':              'Visualizar cronogramas',
  'producao.criar_avulsa':      'Criar produção avulsa',
  'producao.iniciar':           'Iniciar produção',
  'producao.concluir':          'Concluir produção',
  'producao.reverter':          'Reverter para Aguardando Início',
  'producao.desfazer_conclusao':'Desfazer conclusão',
  'producao.imprimir':          'Imprimir cronograma',

  'carregamento.view':         'Visualizar carregamentos',
  'carregamento.criar_editar': 'Criar / editar carregamento',
  'carregamento.excluir':      'Excluir carregamento',
  'carregamento.cronograma':   'Visualizar cronograma',
  'carregamento.dashboard':    'Visualizar dashboard',

  'financeiro.view':                   'Visualizar lançamentos',
  'financeiro.criar_editar':           'Criar / editar lançamento',
  'financeiro.excluir':                'Excluir lançamento',
  'financeiro.marcar_lancado_conferido':'Marcar como Lançado / Conferido',
  'financeiro.imprimir':               'Imprimir lançamento',
  'financeiro.gerenciar_tipos':        'Gerenciar tipos de despesa',

  'atualizacao_status.view':     'Visualizar pedidos e histórico',
  'atualizacao_status.atualizar':'Atualizar status',

  'prioridades.view':     'Visualizar prioridades e atenções',
  'prioridades.gerenciar':'Adicionar / remover prioridade e atenção',

  'programacao_comercial.view':        'Visualizar programação',
  'programacao_comercial.editar_mes':  'Editar mês de programação',
  'programacao_comercial.sincronizar': 'Sincronizar Leroy e Status (Sync)',

  'painel_pedidos.view': 'Visualizar painel de pedidos',

  'painel_tv.view': 'Acessar Painel TV',

  'analise_pedidos.view': 'Acessar análise de pedidos',

  'representantes.view':        'Visualizar representantes',
  'representantes.criar_editar':'Criar / editar representante',
  'representantes.excluir':     'Excluir representante',

  'motoristas.view':        'Visualizar motoristas',
  'motoristas.criar_editar':'Criar / editar motorista',
  'motoristas.excluir':     'Excluir motorista',
  'motoristas.avaliar':     'Avaliar motoristas (estrelas)',
  'motoristas.blacklist':   'Adicionar / remover da lista negra',

  'usuarios.view':            'Visualizar usuários',
  'usuarios.criar_editar':    'Criar / editar usuário',
  'usuarios.excluir':         'Excluir usuário',
  'usuarios.gerenciar_grupos':'Gerenciar grupos e permissões',
};

// ─── Seções para exibição na tela de permissões ──────────────────────────────

export type FuncionalidadeSection = {
  label: string;
  keys: Funcionalidade[];
};

export const funcionalidadeSections: FuncionalidadeSection[] = [
  {
    label: 'Geral',
    keys: ['dashboard.view', 'painel_pedidos.view', 'painel_tv.view'],
  },
  {
    label: 'Análises',
    keys: ['analise_pedidos.view'] as Funcionalidade[],
  },
  {
    label: 'Pedidos de Venda',
    keys: [
      'comercial.view',
      'comercial.detalhes',
      'comercial.atualizar_status',
      'comercial.liberar_gerencia',
      'comercial.confirmar_gerencia',
      'comercial.exportar_pdf_gerencia',
      'comercial.liberar_producao',
      'comercial.exportar_pdf_programacao',
      'comercial.mover_suporte',
    ],
  },
  {
    label: 'Pedidos de Suporte',
    keys: [
      'suporte.view',
      'suporte.detalhes',
      'suporte.atualizar_status',
      'suporte.liberar_producao',
      'suporte.mover_vendas',
    ],
  },
  {
    label: 'Produção',
    keys: [
      'producao.view',
      'producao.criar_avulsa',
      'producao.iniciar',
      'producao.concluir',
      'producao.reverter',
      'producao.desfazer_conclusao',
      'producao.imprimir',
    ],
  },
  {
    label: 'Carregamento',
    keys: ['carregamento.view', 'carregamento.criar_editar', 'carregamento.excluir', 'carregamento.cronograma', 'carregamento.dashboard'],
  },
  {
    label: 'Financeiro',
    keys: [
      'financeiro.view',
      'financeiro.criar_editar',
      'financeiro.excluir',
      'financeiro.marcar_lancado_conferido',
      'financeiro.imprimir',
      'financeiro.gerenciar_tipos',
    ],
  },
  {
    label: 'Atualização de Status',
    keys: ['atualizacao_status.view', 'atualizacao_status.atualizar'],
  },
  {
    label: 'Prioridades',
    keys: ['prioridades.view', 'prioridades.gerenciar'],
  },
  {
    label: 'Programação',
    keys: ['programacao_comercial.view', 'programacao_comercial.editar_mes', 'programacao_comercial.sincronizar'],
  },
  {
    label: 'Cadastro — Representantes',
    keys: ['representantes.view', 'representantes.criar_editar', 'representantes.excluir'],
  },
  {
    label: 'Cadastro — Motoristas',
    keys: ['motoristas.view', 'motoristas.criar_editar', 'motoristas.excluir', 'motoristas.avaliar', 'motoristas.blacklist'],
  },
  {
    label: 'Cadastro — Usuários',
    keys: ['usuarios.view', 'usuarios.criar_editar', 'usuarios.excluir', 'usuarios.gerenciar_grupos'],
  },
];

export const ALL_FUNCIONALIDADES = Object.keys(funcionalidadeLabels) as Funcionalidade[];

// ─── Grupos padrão ───────────────────────────────────────────────────────────

export type GrupoPadrao = {
  nome: string;
  descricao: string;
  is_system: boolean;
  funcionalidades: Funcionalidade[];
};

export const GRUPOS_PADRAO: GrupoPadrao[] = [
  {
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema',
    is_system: true,
    funcionalidades: ALL_FUNCIONALIDADES,
  },
  {
    nome: 'Faturamento',
    descricao: 'Carregamento, financeiro e cadastros',
    is_system: true,
    funcionalidades: [
      'carregamento.view', 'carregamento.criar_editar', 'carregamento.excluir', 'carregamento.cronograma', 'carregamento.dashboard',
      'financeiro.view', 'financeiro.criar_editar', 'financeiro.excluir',
      'financeiro.marcar_lancado_conferido', 'financeiro.imprimir', 'financeiro.gerenciar_tipos',
      'programacao_comercial.view', 'programacao_comercial.editar_mes', 'programacao_comercial.sincronizar',
      'painel_pedidos.view', 'painel_tv.view',
      'representantes.view', 'representantes.criar_editar',
      'motoristas.view', 'motoristas.criar_editar', 'motoristas.avaliar', 'motoristas.blacklist',
    ],
  },
  {
    nome: 'Comercial',
    descricao: 'Pedidos de venda, suporte e liberações',
    is_system: true,
    funcionalidades: [
      'comercial.view', 'comercial.detalhes', 'comercial.atualizar_status',
      'comercial.liberar_gerencia', 'comercial.confirmar_gerencia',
      'comercial.exportar_pdf_gerencia', 'comercial.liberar_producao',
      'comercial.exportar_pdf_programacao', 'comercial.mover_suporte',
      'suporte.view', 'suporte.detalhes', 'suporte.atualizar_status',
      'suporte.liberar_producao', 'suporte.mover_vendas',
      'programacao_comercial.view', 'programacao_comercial.editar_mes', 'programacao_comercial.sincronizar',
      'prioridades.view', 'prioridades.gerenciar',
      'representantes.view', 'representantes.criar_editar',
      'painel_tv.view',
    ],
  },
  {
    nome: 'Produção',
    descricao: 'Cronogramas e execução de produção',
    is_system: true,
    funcionalidades: [
      'producao.view', 'producao.criar_avulsa', 'producao.iniciar',
      'producao.concluir', 'producao.reverter', 'producao.desfazer_conclusao',
      'producao.imprimir',
      'carregamento.view',
      'painel_pedidos.view', 'painel_tv.view',
    ],
  },
  {
    nome: 'Logística',
    descricao: 'Atualização de status e acompanhamento de pedidos',
    is_system: true,
    funcionalidades: [
      'atualizacao_status.view', 'atualizacao_status.atualizar',
      'comercial.view', 'comercial.detalhes',
      'suporte.view', 'suporte.detalhes',
      'prioridades.view', 'prioridades.gerenciar',
      'painel_pedidos.view', 'painel_tv.view',
    ],
  },
];

// ─── Super-admin guard ───────────────────────────────────────────────────────

export const SUPER_ADMIN_USERNAME = 'kmz';

export function isSuperAdmin(username: string): boolean {
  return username.toLowerCase() === SUPER_ADMIN_USERNAME;
}
