# Design de Páginas - Atualização de Status e Painel de Pedidos (WhatsApp)

## Diretrizes Globais (desktop-first)
- **Layout**: grid de 12 colunas (CSS Grid) + componentes internos em Flexbox; container central com largura máxima.
- **Breakpoints**: desktop (>=1280), tablet (>=768), mobile (<768). No mobile, tabelas viram lista em cards.
- **Tokens**:
  - Background: #0B1220 (app) / superfícies: #111A2E
  - Texto: #E5E7EB; secundário: #9CA3AF
  - Acento: #2563EB; sucesso: #16A34A; alerta: #F59E0B; erro: #DC2626
  - Tipografia: 12/14/16/20/24; headings semibold
  - Botões: primário (acento), secundário (outline), destrutivo (erro); hover com +8% brilho
- **Estados**: loading (skeleton em tabela/painel), empty state (mensagem + limpar filtros), erro (banner persistente com retry).

---

## 1) Painel de Pedidos
### Meta Information
- Title: "Painel de Pedidos"
- Description: "Acompanhe pedidos e atualize status com histórico e WhatsApp."
- Open Graph: title/description iguais; type=website

### Page Structure
- **Topo fixo**: título + ações globais.
- **Corpo**: 2 colunas (70/30).
  - Esquerda: filtros + tabela.
  - Direita: detalhe rápido do pedido selecionado.

### Sections & Components
1. **Header**
   - Título "Painel de Pedidos".
   - Ação: "Atualizar" (recarrega lista).
2. **Barra de Filtros (card)**
   - Campos: Período (de/até), Status, Cliente, Nº Pedido.
   - Botões: "Aplicar" (primário), "Limpar" (secundário).
3. **Tabela de Pedidos**
   - Colunas: Nº, Cliente, Status, Última atualização, Responsável, Ações.
   - Interações: clique na linha seleciona; double-click abre Atualização de Status.
   - Ações por linha: "Atualizar status".
4. **Painel Lateral: Detalhe do Pedido**
   - Bloco "Resumo": nº, cliente, telefone, status atual (badge por cor).
   - Bloco "Linha do tempo": lista vertical (data/hora, de→para, usuário, nota).
   - Bloco "Operações": tabela compacta (tipo, data, usuário).
   - Bloco "WhatsApp":
     - Botão "Enviar status".
     - Último envio: status (enviado/erro) + mensagem de erro (se houver).

---

## 2) Atualização de Status
### Meta Information
- Title: "Atualização de Status"
- Description: "Atualize o status do pedido com auditoria e envio via WhatsApp."
- Open Graph: title/description iguais; type=website

### Page Structure
- **Layout**: coluna única com cards empilhados; largura máxima ~960px.

### Sections & Components
1. **Cabeçalho**
   - Breadcrumb: "Pedidos > Atualização de Status".
   - Identificação do pedido: Nº + cliente.
2. **Card: Status atual**
   - Badge do status; última atualização; responsável.
3. **Card: Nova atualização**
   - Campo "Novo status" (select).
   - Campo "Observação" (textarea, opcional/condicional).
   - Checkbox: "Enviar WhatsApp após salvar" (default ligado quando há telefone).
   - Botões: "Salvar" (primário), "Cancelar".
4. **Card: Prévia WhatsApp (quando habilitado)**
   - Preview do texto da mensagem.
   - Campo editável "Mensagem" (mantém template base + permite ajustes).
5. **Card: Histórico**
   - Linha do tempo de status (somente leitura).
   - Log de envios WhatsApp (timestamp, status, erro).

### Interações e Regras
- Ao salvar: 1) grava histórico de status + operação, 2) se WhatsApp ligado, chama função de envio e grava resultado.
- Em falha de WhatsApp: status do pedido permanece salvo; UI exibe banner "Envio falhou" + botão "Tentar novamente".
