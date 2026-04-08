# Design de Páginas (desktop-first)

## Global Styles (tokens e padrões)
- Layout base: App shell com **Sidebar fixa** (64px colapsada / 256px expandida) + **Header** + área de conteúdo.
- Tipografia: 
  - Títulos: 24–32px, peso 700.
  - Corpo: 14–16px.
  - Dados/IDs: fonte monoespaçada (ex.: “PED-001”).
- Cores: usar tema atual (Tailwind) com `primary` (sidebar), `card`, `muted`, `border`.
- Botões:
  - Primário: fundo `primary`, texto `primary-foreground`, hover 90% opacidade.
  - Perigo: `destructive`.
  - Sidebar item: variante com estados `active` (bg white/10 + borda white/20).
- Estados:
  - Disabled: opacidade 50% + cursor not-allowed.
  - Sem acesso: mensagem com CTA “Voltar ao Dashboard”.

## Página: Login
- Layout: tela centralizada (Flexbox), cartão de login com largura 420–520px.
- Meta:
  - title: “Concrem — Login”
  - description: “Acesso ao sistema de programação e faturamento.”
- Estrutura:
  1. Brand/header (logo).
  2. Campo “Usuário” (texto) e, se necessário, “Senha” (opcional no modo local).
  3. **Seleção de Perfil** (Select): Admin / Comercial / Operacional / Faturamento.
  4. Botão “Entrar”.
  5. Mensagens inline de validação.
- Interações:
  - Ao entrar: gravar `auth_token`, `auth_user` e `role/permissions` no localStorage.

## Página: Shell (MainLayout) + Sidebar dinâmica
- Layout: CSS Grid (coluna sidebar fixa + coluna conteúdo fluida).
- Sidebar:
  - Seções com acordeão (ex.: “Cadastro”, “Operacional”, “Comercial”, “Faturamento”).
  - **Renderização por acesso**: itens só aparecem se `permissions` permitir.
  - Colapsada: ícones + tooltip; expandida: ícone + label + acordeão.
  - Rodapé: bloco de usuário (nome, username, perfil) + ação “Sair”.
- Proteção de rota:
  - Ao detectar rota sem permissão: redirecionar para “/” ou exibir página “Sem Acesso” (simples).

## Página: Dashboard
- Layout: empilhado por seções; grid de cards no topo.
- Meta:
  - title: “Concrem — Dashboard”
- Seções:
  1. Cabeçalho (título + subtítulo).
  2. Cards KPI (mostrar apenas os relevantes ao perfil).
  3. Tabelas/resumos (ex.: últimos pedidos) apenas se o perfil puder visualizar.
  4. Atalhos (cards/botões) para páginas permitidas.

## Página: Pedidos (Comercial) — nova
- Layout: tabela + toolbar (filtro/ação) + modal/sidepanel de edição.
- Meta:
  - title: “Concrem — Pedidos”
- Seções:
  1. Toolbar: busca por ID/cliente; botão “Novo Pedido” (somente Comercial/Admin).
  2. Tabela: ID, cliente, data, valor, status (inclui “Pronto para Faturamento”).
  3. Ações por linha: editar; marcar “Pronto para Faturamento”.
- Interações:
  - Ao marcar pronto: atualizar status do pedido (local) e liberar para aparecer na fila do Faturamento.

## Página: Programação de Embarques (/embarque)
- Layout: tabela com CTA “Nova Programação”.
- Meta:
  - title: “Concrem — Programação de Embarques”
- Seções:
  1. Lista de programações (ID, motorista, data, valor, frete, status).
  2. Ação “Editar”.

## Página: Criar/Editar Programação (/embarque/novo e /embarque/editar/:id)
- Layout: formulário em cartões (grid) + lista de pedidos com filtros.
- Meta:
  - title: “Concrem — Nova/Editar Programação”
- Seções:
  1. Header com voltar + CTA salvar/cancelar.
  2. Card “Informações do Transporte” (motorista, data, frete, status).
  3. Card “Lista de Pedidos” (filtros e seleção).
  4. Ações auxiliares (ex.: mensagens/relatório WhatsApp) mantidas como estão.

## Página: Faturamento (/financeiro)
- Layout: dashboard + lista (tabs ou seções) para “Pedidos aptos” e “Faturas”.
- Meta:
  - title: “Concrem — Faturamento”
- Seções:
  1. Fila de pedidos aptos (status “Pronto para Faturamento”).
  2. Botão “Gerar Fatura” (abre modal: seleciona pedidos, datas, método).
  3. Lista de faturas (status Pendente/Pago/Vencido) e ação “Atualizar status”.

## Página: Cadastros (Representantes e Motoristas)
- Layout: tabela + busca + modal de CRUD.
- Meta:
  - title: “Concrem — Cadastros” (ou manter títulos por página)
- Seções:
  1. Busca.
  2. Tabela.
  3. Modal de criação/edição.
- Acesso:
  - Exibir/permitir ações conforme perfil (Admin total; demais conforme necessidade).
