# Design de Páginas — Padrão Único de Filtros

## Diretrizes globais (desktop-first)

### Layout
- Abordagem híbrida: **CSS Grid** para cabeçalhos/toolbar de listagem e **Flexbox** para linhas de condição no painel.
- Breakpoints:
  - Desktop (padrão): painel como **Dialog** central ou **Sheet** lateral (conforme padrão atual da aplicação), com largura fixa.
  - Tablet/mobile: painel como **Sheet** full-height (lado direito) e ações fixas no rodapé.

### Meta Information (para páginas de listagem)
- Title: "{Nome da Página} — Listagem"
- Description: "Consultar e filtrar {entidade} usando critérios combináveis."
- Open Graph: title/description espelhando o title/description.

### Global Styles (tokens e estados)
- Fonte: padrão do app (shadcn/tailwind), base 14–16px.
- Cores:
  - Fundo: neutro claro (padrão do app).
  - Acento: cor primária existente (não criar nova).
- Botão de filtro (obrigatório):
  - Variante: **branco** (outline/secondary light).
  - Tamanho: **menor** (height ~32px; padding horizontal reduzido).
  - Ícone: funil (se já usado no app), à esquerda do texto.
  - Estados: hover com leve escurecimento de borda/fundo; disabled com opacidade.
- Chips de filtros ativos:
  - Aparência: “pill” neutra + texto curto + “x” para remover.
  - Overflow: quando muitos chips, quebrar linha; manter legibilidade.

---

## Página 1 — Páginas de Listagem (padrão global)

### Page Structure
- Estrutura em pilha:
  1) Cabeçalho da página (título).
  2) Toolbar (ações + botão “Filtros”).
  3) Área de filtros ativos (chips).
  4) Conteúdo principal (tabela/cards).

### Seções & Componentes
1. **Header**
   - Título da listagem.
   - (Opcional) subtítulo curto contextual.

2. **Toolbar**
   - Posição do botão: sempre na toolbar, alinhado à direita (ou conforme padrão do app), consistente entre páginas.
   - **Botão “Filtros” (branco, menor)**:
     - Label: “Filtros”.
     - Ação: abrir painel “Configurar Filtros”.
     - Badge opcional: contador de filtros ativos (ex.: “3”) ao lado do texto.

3. **Filtros ativos (chips)**
   - Cada chip representa uma condição: “Campo Operador Valor”.
   - Ação por chip: remover condição imediatamente e atualizar listagem.
   - Ação global (opcional na mesma área): “Limpar” para remover todos.

4. **Conteúdo**
   - Tabela/lista existente.
   - Estado vazio deve diferenciar:
     - “Sem resultados com os filtros atuais” (quando filtros ativos).
     - “Sem registros” (quando sem filtros).

---

## Overlay — Painel “Configurar Filtros”

### Layout
- Container em card/painel com:
  - Cabeçalho: título + fechar.
  - Corpo: lista de condições.
  - Rodapé: ações primárias.

### Seções & Componentes
1. **Cabeçalho do painel**
   - Título: “Configurar Filtros”.
   - Botão fechar (X): fecha sem aplicar mudanças pendentes.

2. **Lista de condições**
   - Renderizar N linhas, cada linha com:
     - Select **Campo** (ex.: “Status”, “Data”, “Cliente” — definidos pela página).
     - Select **Operador** (dependente do tipo do campo; ex.: igual, contém, entre, maior/menor).
     - Input **Valor** (componente dependente do tipo: texto, número, data, select).
     - Botão **Remover** (ícone lixeira ou “-”).
   - Botão **Adicionar filtro**:
     - Insere nova linha com foco no select de Campo.

3. **Ações do painel (rodapé)**
   - **Aplicar** (primário): valida condições e aplica na listagem.
   - **Limpar** (secundário): remove todas as condições (e atualiza chips após aplicar/confirmar).
   - **Cancelar/Fechar** (terciário): fecha sem aplicar mudanças pendentes.

### Regras de interação e validação
- Não permitir aplicar com linha incompleta (campo/operador/valor).
- Ao mudar o **Campo**, resetar Operador/Valor se não forem compatíveis.
- Feedback de erro: mensagem curta abaixo do controle inválido.
- Persistência recomendada (consistência): manter filtros ao navegar dentro da mesma rota (ex.: por querystring ou state local), conforme padrão já usado no app.
