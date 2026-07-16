# 🔒 Auditoria de Segurança — Sistema Concrem

> **Tipo:** Auditoria *read-only* (somente leitura). Nenhum arquivo, configuração, migration ou dado foi alterado durante esta análise.
> **Alvo:** `faturamento-concrem-main` (React + Vite + TypeScript sobre Supabase, deploy na Vercel).
> **Data:** 26/06/2026
> **Método:** Inspeção estática do código-fonte, das variáveis de ambiente (`.env`/`.env.example`), das migrations SQL versionadas (`supabase/migrations/`) e da configuração de deploy (`vercel.json`).

---

## 📋 Como ler este relatório

Cada achado tem:
- **Severidade** — 🔴 Crítica / 🟠 Alta / 🟡 Média / 🔵 Baixa / ⚪ Informativa
- **Onde** — arquivo e linha
- **O que é / Por que é perigoso** — explicado sem jargão
- **Como corrigir** — passo a passo prático

> **Conceito-chave que aparece o tempo todo:** o Vite (ferramenta que monta o site) pega **toda** variável que começa com `VITE_` e a **escreve dentro do arquivo JavaScript** que é enviado para o navegador de cada visitante. Ou seja: **tudo que é `VITE_*` é público.** Qualquer pessoa que abrir o site e apertar F12 (ferramentas de desenvolvedor) consegue ler esses valores. Isso não é um bug do seu código — é como o Vite funciona. Por isso, **nenhum segredo de verdade pode ser uma variável `VITE_*`.**

---

## 1. Exposição de segredos no bundle (prioridade máxima)

### 1.1 — 🔴 CRÍTICA — Chave da Evolution API (WhatsApp) exposta no navegador

- **Onde:**
  - [.env:13](.env#L13) — `VITE_EVOLUTION_API_KEY=DDCC3A3A31E3-4D87-B0DF-63187F0855A0`
  - [src/lib/evolutionApi.ts:11](src/lib/evolutionApi.ts#L11) — lê `import.meta.env.VITE_EVOLUTION_API_KEY`
  - [src/lib/evolutionApi.ts:39](src/lib/evolutionApi.ts#L39) — envia essa chave no header `apikey` para `https://evo.infinityia.online`

- **O que é:** A Evolution API é o servidor que dispara as mensagens de WhatsApp da empresa. Para autenticar, ela exige um header `apikey`. Essa chave está numa variável `VITE_EVOLUTION_API_KEY` — portanto está **dentro do JavaScript público do site**.

- **Por que é perigoso:** Qualquer pessoa que abrir o site no navegador, ir em F12 → aba "Network" (ou "Sources"), consegue **ler a chave em texto puro**. De posse dela, um atacante pode chamar `https://evo.infinityia.online/message/sendText/Concrem%20Oficial` diretamente e **enviar mensagens de WhatsApp em nome da Concrem** para qualquer número, sem passar pelo seu sistema. Isso permite golpes de phishing ("seu boleto está em anexo…"), spam em massa a partir do seu número oficial, e pode levar ao **banimento do número** pelo WhatsApp. A chave atual (`DDCC3A3A31E3-...`) deve ser considerada **comprometida** a partir do momento em que o site foi ao ar.

- **Como corrigir (passo a passo):**
  1. **Rotacione a chave já:** no painel da Evolution API, gere uma nova `apikey` e invalide a atual (`DDCC3A3A31E3-...`).
  2. **Tire o envio de WhatsApp do navegador.** O fluxo correto é: o navegador chama uma função no **servidor** (ex.: uma *Supabase Edge Function* ou uma *Serverless Function* da Vercel em `/api/whatsapp`), e **só essa função no servidor** conhece a chave (guardada como variável de ambiente **sem** o prefixo `VITE_`, ex.: `EVOLUTION_API_KEY`).
  3. No código, troque a chamada direta `fetch('https://evo.infinityia.online/...')` por uma chamada à sua própria função (`fetch('/api/whatsapp/send', { body: { phone, text } })`).
  4. Assim a chave nunca chega ao navegador.

- **Como confirmar a correção:** Faça o build (`npm run build`), abra a pasta `dist/` e rode uma busca (`grep -r "apikey"` ou abra os `.js`); a chave da Evolution **não pode aparecer** em nenhum arquivo de `dist/`.

---

### 1.2 — 🟠 ALTA — Padrão de envio de e-mail (Resend) projetado para rodar no navegador

- **Onde:**
  - [src/pages/ComercialConfirmacao.tsx:373](src/pages/ComercialConfirmacao.tsx#L373) — `const apiKey = import.meta.env.VITE_RESEND_API_KEY`
  - [src/pages/ComercialConfirmacao.tsx:390-391](src/pages/ComercialConfirmacao.tsx#L390-L391) — `const { Resend } = await import('resend'); const resend = new Resend(apiKey)`
  - [.env:9](.env#L9) — `VITE_RESEND_API_KEY=` (atualmente **vazia**)

- **O que é:** O código está pronto para enviar e-mails pelo serviço Resend usando uma chave `VITE_RESEND_API_KEY` e instanciando o SDK do Resend **no próprio navegador**.

- **Por que é perigoso:** Hoje a chave está vazia, então **não há vazamento ativo** — por isso é Alta e não Crítica. Mas no momento em que você preencher `VITE_RESEND_API_KEY` para "ligar" o e-mail, a chave do Resend ficará **pública no bundle** (mesmo problema da Evolution). Com a chave do Resend, um atacante envia e-mails em nome do seu domínio (phishing com remetente legítimo, queima da reputação de envio do domínio).

- **Como corrigir:**
  1. **Não preencha `VITE_RESEND_API_KEY`.** Trate o envio de e-mail como uma operação de servidor, igual ao WhatsApp: uma função serverless (`/api/email/send`) que guarda a chave como `RESEND_API_KEY` (sem `VITE_`).
  2. O navegador só manda os dados do e-mail (destinatário, assunto, anexo) para essa função; a função adiciona a chave e chama o Resend.

- **Como confirmar:** Após implementar, a string `re_` (prefixo das chaves Resend) não deve aparecer no `dist/`.

---

### 1.3 — 🔵 BAIXA — `.env` não está no `.gitignore` (risco latente) e `.env.example` versionado contém anon key real

- **Onde:**
  - [.gitignore](.gitignore) — **não** lista `.env` (só ignora `*.local`)
  - [.env.example:6](.env.example#L6) — contém a anon key real do projeto em `VITE_SUPABASE_OPS_KEY=eyJ...`

- **O que é:** Verifiquei no git: o arquivo `.env` **não está commitado hoje** (bom). Mas ele **não está protegido** pelo `.gitignore` — então um `git add .` distraído commitaria o arquivo com a chave da Evolution para o histórico. Além disso, o `.env.example` (esse sim versionado) traz uma **anon key real** preenchida.

- **Por que é perigoso:** A anon key é pública por natureza (ver Seção 2), então tê-la no `.env.example` não é catastrófico — mas é má prática e confunde quem clona o projeto. O risco maior é o `.env` "de verdade" (com a chave da Evolution) ser commitado por acidente e ficar **para sempre no histórico do git**, mesmo que apagado depois.

- **Como corrigir:**
  1. Adicione ao `.gitignore`: as linhas `.env` e `.env.*` (mantendo uma exceção `!.env.example` se quiser versionar o template).
  2. No `.env.example`, deixe os campos de chave **em branco** (ex.: `VITE_SUPABASE_OPS_KEY=`), servindo só de modelo.

- **Como confirmar:** `git check-ignore .env` deve responder `.env` (indicando que está ignorado).

---

### 1.4 — ✅ POSITIVO — `service_role` NÃO encontrada no frontend

- **Resultado da busca:** procurei por `service_role`, `SERVICE_ROLE`, `serviceRole`, `supabaseServiceKey` e JWTs com `"role":"service_role"` em todo o código. **Nenhuma ocorrência.**
- As duas chaves Supabase presentes (`VITE_SUPABASE_ANON_KEY` e `VITE_SUPABASE_OPS_KEY`) são **idênticas** e, ao decodificar o JWT, o campo é `"role":"anon"` (projeto `ctntlgvoefdbjxvfkahp`). 
- **Conclusão:** Você escapou do pior cenário. A `service_role` (que ignora todas as regras de segurança do banco) **não** está exposta. Isso é exatamente o que se espera de um projeto bem-intencionado. **Mantenha assim** — a `service_role` nunca deve sair do servidor.

---

### 1.5 — Inventário de variáveis `import.meta.env.VITE_*` referenciadas

| Variável | Aparência de segredo? | Situação |
|---|---|---|
| `VITE_EVOLUTION_API_KEY` | 🔴 **Sim — segredo** | Exposta no bundle (achado 1.1) |
| `VITE_RESEND_API_KEY` | 🟠 **Sim — segredo** | Vazia hoje; perigosa se preenchida (1.2) |
| `VITE_SUPABASE_ANON_KEY` | 🟡 Pública por design | OK ser pública, **desde que haja RLS** (Seção 4) |
| `VITE_SUPABASE_OPS_KEY` | 🟡 Pública por design | Igual à anon key acima |
| `VITE_SUPABASE_URL` | ⚪ Não-segredo | Endereço do projeto, normal ser público |
| `VITE_SUPABASE_OPS_URL` | ⚪ Não-segredo | Igual à URL acima |
| `VITE_EVOLUTION_API_URL` | ⚪ Não-segredo | Endereço do servidor Evolution |
| `VITE_EVOLUTION_INSTANCE` | ⚪ Não-segredo | Nome da instância ("Concrem Oficial") |
| `VITE_SUPABASE_PEDIDOS_TABLE` | ⚪ Não-segredo | Nome de tabela |

> **Resumo da seção:** o único segredo **ativamente vazado** é a chave da Evolution (1.1). A do Resend é uma bomba-relógio desarmada (1.2). As chaves Supabase são anon (públicas por design) — a segurança delas depende **inteiramente** do RLS, que é o assunto da Seção 4 e onde mora o problema mais grave.

---

## 2. Superfície de acesso ao Supabase

### 2.1 — Clientes Supabase configurados

Analisando [src/lib/supabase.ts](src/lib/supabase.ts):

| Client exportado | URL | Key | Projeto |
|---|---|---|---|
| `supabasePedidos` | `VITE_SUPABASE_URL` | `VITE_SUPABASE_ANON_KEY` (anon) | `ctntlgvoefdbjxvfkahp` |
| `supabaseOps` | `VITE_SUPABASE_OPS_URL` | `VITE_SUPABASE_OPS_KEY` (anon) | `ctntlgvoefdbjxvfkahp` |
| `supabase` | (alias de `supabasePedidos`) | — | `ctntlgvoefdbjxvfkahp` |

- **Confirmação:** as duas URLs são iguais e as duas keys são **a mesma anon key**. O próprio código ([src/lib/supabase.ts:21-23](src/lib/supabase.ts#L21-L23)) detecta isso e **reaproveita o mesmo client** quando URL e key coincidem. Ou seja: na prática existe **um único projeto Supabase e uma única chave (anon)**, apenas com nomes diferentes (`pedidos` e `ops`).
- **Implicação:** Não há separação de privilégios entre "pedidos" e "operações" — qualquer permissão dada à anon key vale para **todas** as tabelas do projeto.

### 2.2 — Mapa de chamadas `.from('<tabela>')` (operações por tabela)

Enumerei todas as chamadas no código (`src/`). Todas usam o client **anon** (`supabaseOps`/`supabasePedidos`). Contagem de ocorrências e operações observadas:

| Tabela | Ocorrências | Operações observadas | Onde (principais) |
|---|---|---|---|
| `concrem_pedidos_status` | 66 | select, insert, update, upsert | [pedidosStatusRepo.ts](src/lib/pedidosStatusRepo.ts) |
| `concrem_pedidos_status_historico` | 19 | select, insert | [pedidosStatusRepo.ts](src/lib/pedidosStatusRepo.ts) |
| `concrem_programacoes_embarque` | 10 | select, upsert, **delete** | [opsRepo.ts](src/lib/opsRepo.ts), [AppContext.tsx](src/contexts/AppContext.tsx) |
| `concrem_usuarios` | 9 | select, insert, update, **delete** | [cadastrosOps.ts](src/lib/cadastrosOps.ts), [AppContext.tsx](src/contexts/AppContext.tsx) |
| `concrem_grupos` | 7 | select, insert, **delete** | [gruposRepo.ts](src/lib/gruposRepo.ts) |
| `concrem_entregas` | 7 | select, upsert, **delete** | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_comercial_pedidos_acoes` | 7 | select, insert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_representantes` | 6 | select, insert, update, **delete** | [cadastrosOps.ts](src/lib/cadastrosOps.ts), [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_motoristas` | 6 | select, insert, update, **delete** | [cadastrosOps.ts](src/lib/cadastrosOps.ts) |
| `concrem_faturamento_justificativas` | 6 | select, insert, update | (faturamento) |
| `concrem_protocolos_financeiros` | 5 | select, insert, update | [protocoloFinanceiro.ts](src/lib/protocoloFinanceiro.ts) |
| `concrem_pedido_prioridades` | 5 | select, upsert | [prioridadesRepo.ts](src/lib/prioridadesRepo.ts) |
| `concrem_pedido_atencao` | 5 | select, insert, **delete** | [atencaoRepo.ts](src/lib/atencaoRepo.ts) |
| `concrem_lancamentos_financeiros` | 5 | select, upsert, **delete** | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_relatorio_entrega_notificacoes` | 3 | select, **delete** | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_relatorio_entrega_anexos` | 3 | upsert, **delete** | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_protocolos_pedidos` | 3 | select, insert | [protocoloFinanceiro.ts](src/lib/protocoloFinanceiro.ts) |
| `concrem_producao_concluidos` | 3 | select, insert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_motoristas_avaliacoes` | 3 | select, insert, **delete** | [cadastrosOps.ts](src/lib/cadastrosOps.ts) |
| `concrem_faturamento_metas` | 3 | select, upsert | (faturamento) |
| `concrem_tipos_despesa` | 2 | select, upsert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_lancamentos_despesas` | 2 | insert, **delete** | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_comercial_pedidos_meta` | 2 | upsert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_producao_confirmacoes` | 1 | insert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_notificacoes_representantes_pedidos` | 1 | insert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_notificacoes_representantes` | 1 | insert | [opsRepo.ts](src/lib/opsRepo.ts) |
| `concrem_pedidos_venda` *(via env var)* | vários | select, update | acessada por `VITE_SUPABASE_PEDIDOS_TABLE` em ~15 arquivos |

### 2.3 — Tabelas/recursos acessados que NÃO estão no inventário de 28 tabelas

- 🟡 **`concrem_pedidos_sistema`** — aparece como **valor padrão de fallback** em ~15 arquivos (ex.: [AppContext.tsx:348](src/contexts/AppContext.tsx#L348), [Programacao.tsx:81](src/pages/Programacao.tsx#L81), [protocoloFinanceiro.ts:35](src/lib/protocoloFinanceiro.ts#L35)). O padrão é `import.meta.env.VITE_SUPABASE_PEDIDOS_TABLE || 'concrem_pedidos_sistema'`. Como o `.env` define `VITE_SUPABASE_PEDIDOS_TABLE=concrem_pedidos_venda`, na prática usa-se `concrem_pedidos_venda` (que está no inventário). Mas o fallback aponta para `concrem_pedidos_sistema`, que **não está na lista de 28**. Há ainda **inconsistência**: alguns arquivos usam `|| 'concrem_pedidos_venda'` e outros `|| 'concrem_pedidos_sistema'` como padrão. **Recomendação:** padronizar o fallback e confirmar qual tabela é a verdadeira; se `concrem_pedidos_sistema` não existe, o fallback está morto (e mascararia um erro de config silenciosamente).
- 🔵 **`relatorio-entrega`** — **não é tabela, é um bucket do Supabase Storage** ([CarregamentoDashboard.tsx:408](src/pages/CarregamentoDashboard.tsx#L408) define `STORAGE_BUCKET = 'relatorio-entrega'`; usado em `supabaseOps.storage.from(...)` para upload/download/list/remove, e em [CreateShipment.tsx:1357](src/pages/CreateShipment.tsx#L1357)). **Atenção:** o Storage tem suas **próprias políticas de RLS**, separadas das tabelas. Inclua esse bucket no plano de RLS (hoje os arquivos são lidos/gravados/apagados via anon — ver Seção 4). Note ainda `getPublicUrl` ([CarregamentoDashboard.tsx:514](src/pages/CarregamentoDashboard.tsx#L514)): se o bucket for público, os anexos de entrega são acessíveis por URL sem autenticação.

---

## 3. Autorização feita só no cliente (sem barreira no servidor)

> **O conceito:** "autorização no cliente" significa que a decisão de "esse usuário **pode** fazer isso?" acontece no navegador (em JavaScript/na interface). O problema: o navegador é território do usuário. Um atacante não precisa usar a sua tela — ele abre o console (F12) e chama o Supabase **diretamente** com a anon key (que é pública). Se o banco não tiver uma regra própria (RLS) barrando, a verificação que você fez na tela é **ignorada**. Toda checagem de perfil/permissão em JS é, no máximo, uma conveniência de UX — **nunca** uma trava de segurança.

Operações sensíveis cuja autorização hoje depende **apenas** do frontend (a anon key tem GRANT total e o RLS é permissivo — Seção 4):

### 3.1 — 🔴 CRÍTICA — Gestão de usuários e permissões via anon

- **Onde:** [src/lib/cadastrosOps.ts:231-283](src/lib/cadastrosOps.ts#L231-L283) — `insertUsuario`, `updateUsuario`, `deleteUsuario` em `concrem_usuarios`; [src/lib/gruposRepo.ts](src/lib/gruposRepo.ts) — criar/alterar/excluir `concrem_grupos` (que definem as permissões/`funcionalidades`).
- **Por que é perigoso:** quem tiver a anon key (qualquer visitante) pode, pelo console, **criar um usuário admin**, **mudar o próprio perfil para administrador**, ou **apagar usuários**. Como `concrem_grupos` guarda as `funcionalidades` (o que cada perfil pode acessar), dá para **se autopromover** e liberar todas as telas. A "verificação de perfil" feita na interface não impede isso.

### 3.2 — 🔴 CRÍTICA — Escrita em dados financeiros via anon

- **Onde:** [src/lib/opsRepo.ts:484](src/lib/opsRepo.ts#L484) (`upsert` em `concrem_lancamentos_financeiros`), [opsRepo.ts:510](src/lib/opsRepo.ts#L510) (`delete`), [opsRepo.ts:491](src/lib/opsRepo.ts#L491)/[501](src/lib/opsRepo.ts#L501) (`concrem_lancamentos_despesas`), além de `concrem_protocolos_financeiros`, `concrem_faturamento_metas/justificativas`.
- **Por que é perigoso:** lançamentos financeiros, despesas e metas podem ser **inseridos, alterados ou apagados por qualquer pessoa** com a anon key, sem login válido. Isso permite fraude (alterar valores), sabotagem (apagar lançamentos) e vazamento (ler tudo).

### 3.3 — 🟠 ALTA — Exclusões/escritas operacionais via anon

- **Onde:** `delete` em `concrem_programacoes_embarque` ([opsRepo.ts:54](src/lib/opsRepo.ts#L54)), `concrem_entregas`, `concrem_pedido_atencao`, `concrem_motoristas`, `concrem_representantes`, e os `delete` em cascata de [opsRepo.ts:613-615](src/lib/opsRepo.ts#L613-L615).
- **Por que é perigoso:** dados operacionais (embarques, entregas, cadastros) podem ser destruídos sem autorização real.

> **A correção de todos os itens da Seção 3 é a mesma e está na Seção 4: implementar RLS de verdade.** A regra de ouro: **toda decisão de autorização precisa existir no servidor (no banco, via RLS/políticas, ou numa Edge Function), não só na tela.**

---

## 4. Estado do RLS no repositório (o problema central)

> **O que é RLS:** *Row Level Security* ("segurança em nível de linha") é o mecanismo do PostgreSQL/Supabase que decide, **no banco**, quem pode ler/escrever **cada linha** de cada tabela. É a trava que protege seus dados mesmo quando a chave usada (a anon) é pública. **Sem RLS efetivo, a anon key pública = banco aberto para o mundo.**

Existem migrations versionadas em `supabase/migrations/` (18 arquivos `.sql`). Há, sim, `ENABLE ROW LEVEL SECURITY` e `CREATE POLICY`. Mas encontrei **dois problemas graves** que fazem o RLS, na prática, **não proteger nada**.

### 4.1 — 🔴 CRÍTICA — As políticas de RLS são totalmente permissivas (`using (true)` para `anon`)

- **Onde (exemplos):**
  - [ops_cadastros_rls_grants.sql:94-109](supabase/migrations/ops_cadastros_rls_grants.sql#L94-L109) — `usuarios`: políticas de **select/insert/update/delete para `anon` com `using (true)` / `with check (true)`**
  - [ops_ops_tables_rls_grants_v2.sql:47-62](supabase/migrations/ops_ops_tables_rls_grants_v2.sql#L47-L62) — `programacoes_embarque`: idem (anon pode tudo)
  - [ops_ops_tables_rls_grants_v2.sql:147-179](supabase/migrations/ops_ops_tables_rls_grants_v2.sql#L147-L179) — `financeiro_embarque`: anon pode select/insert/update/delete
  - `GRANT select, insert, update, delete ... TO anon` em [ops_cadastros_rls_grants.sql:128-130](supabase/migrations/ops_cadastros_rls_grants.sql#L128-L130) e [ops_ops_tables_rls_grants_v2.sql:181-185](supabase/migrations/ops_ops_tables_rls_grants_v2.sql#L181-L185)

- **O que é:** Ligar o RLS e depois criar uma política `using (true)` é como **trancar a porta e deixar a chave na fechadura**. `using (true)` quer dizer "a condição para acessar esta linha é… verdadeiro", ou seja, **sempre libera**. E isso vale para o papel `anon` — que é justamente a chave pública embutida no site.

- **Por que é perigoso:** Com a anon key (que está no bundle, ver Seção 1.5) + políticas `using(true)` + `GRANT ... TO anon`, **qualquer pessoa na internet** pode, do console do navegador:
  ```js
  // exemplo do que um atacante faz — NÃO execute em produção
  const sb = supabase.createClient(URL_PUBLICA, ANON_KEY_PUBLICA)
  await sb.from('concrem_usuarios').select('*')        // baixa todos os usuários (e senha_hash!)
  await sb.from('concrem_lancamentos_financeiros').select('*')  // lê todo o financeiro
  await sb.from('concrem_usuarios').delete().neq('id','')       // apaga todos os usuários
  ```
  Na prática, **o banco está aberto para leitura, escrita e exclusão por qualquer um.** As verificações de perfil da Seção 3 não impedem nada disso.

- **Como corrigir (passo a passo):**
  1. **Adote autenticação de verdade do Supabase (Supabase Auth)** em vez de validar senha no cliente (ver Seção 5). Só assim o papel `authenticated` passa a representar um usuário logado de verdade, com `auth.uid()`.
  2. **Remova os GRANTs e políticas para `anon`** em tabelas sensíveis. A anon key não deveria poder escrever em nada crítico.
  3. **Troque `using (true)` por condições reais.** Exemplos de intenção:
     - `concrem_usuarios`: um usuário só lê/edita o **próprio** registro; só `admin` lê todos. (`using (auth.uid() = id OR <é admin>)`)
     - financeiro: `using (<usuário pertence ao setor financeiro>)`.
  4. **Nunca exponha `senha_hash`** (ver 5.1) — restrinja por coluna ou pare de usar senha própria.
  5. Faça isso tabela por tabela; enquanto não houver política correta, é melhor **negar por padrão** (RLS ligado + nenhuma política = ninguém acessa, e aí o acesso passa a ser via servidor/Edge Function com `service_role`).

### 4.2 — 🔴 CRÍTICA — As migrations de RLS miram tabelas com nome ERRADO (sem o prefixo `concrem_`)

- **Onde:**
  - [ops_cadastros_rls_grants.sql:1-3](supabase/migrations/ops_cadastros_rls_grants.sql#L1-L3) — `alter table if exists public.usuarios ... / public.representantes / public.motoristas`
  - [ops_ops_tables_rls_grants_v2.sql:1-5](supabase/migrations/ops_ops_tables_rls_grants_v2.sql#L1-L5) — `public.programacoes_embarque`, `public.entregas`, `public.financeiro_embarque`, etc.
  - [ops_comercial_pedidos_rls_grants.sql:1-2](supabase/migrations/ops_comercial_pedidos_rls_grants.sql#L1-L2) — `public.comercial_pedidos_meta`, `public.comercial_pedidos_acoes`

- **O que é:** O **código** acessa tabelas **com prefixo** (`concrem_usuarios`, `concrem_programacoes_embarque`, `concrem_entregas`, `concrem_financeiro...`). Mas as migrations de RLS ligam segurança em tabelas **sem prefixo** (`usuarios`, `programacoes_embarque`, `entregas`, …). São **nomes diferentes** = objetos diferentes no banco.

- **Por que é gravíssimo:** as migrations usam `alter table IF EXISTS`. Se a tabela `public.usuarios` (sem prefixo) **não existe**, o comando **não faz nada e não dá erro** — passa silenciosamente. Resultado provável: as tabelas **reais** (`concrem_*`), que são as que o app usa, podem estar **com RLS desligado e sem nenhuma política** — ou seja, **abertas** via anon, sem nem o disfarce do `using(true)`. As políticas "de fachada" foram aplicadas a tabelas fantasmas/antigas que o app nem usa.

- **Como confirmar (você precisa rodar no Supabase — eu não alterei nada):** no SQL Editor do Supabase, rode (somente leitura):
  ```sql
  -- Quais tabelas concrem_* têm RLS ligado?
  select relname, relrowsecurity
  from pg_class
  where relname like 'concrem_%' and relkind = 'r'
  order by relname;

  -- Quais políticas existem nas tabelas concrem_*?
  select schemaname, tablename, policyname, roles, cmd, qual
  from pg_policies
  where tablename like 'concrem_%'
  order by tablename, policyname;
  ```
  Se a primeira query mostrar `relrowsecurity = false` (ou a segunda vier vazia) para tabelas `concrem_*`, está **confirmado**: o RLS real não existe e o banco está aberto.

- **Como corrigir:** refaça as políticas mirando os **nomes corretos com `concrem_`**, já no formato restritivo da seção 4.1 (não copie o `using(true)`).

> ⚠️ **Este é o achado mais importante da auditoria.** A combinação 4.1 + 4.2 significa que o alerta do scanner externo ("anon key exposta + tabelas sem RLS") está **correto e ativo**: a chave pública dá acesso real ao banco.

---

## 5. Sessão e dados sensíveis no navegador

### 5.1 — 🔴 CRÍTICA — `senha_hash` de usuários é trazido para o navegador

- **Onde:**
  - [src/contexts/AppContext.tsx:644-652](src/contexts/AppContext.tsx#L644-L652) — no login: `.from('concrem_usuarios').select('*').eq('email', username)` e depois `verifyPassword(password, data.senha_hash)` **no cliente**.
  - [src/lib/cadastrosOps.ts:214](src/lib/cadastrosOps.ts#L214) — `listUsuarios()` faz `select('id,nome,email,senha_hash,...')` de **todos** os usuários.

- **O que é:** A verificação de senha acontece **no navegador**: o sistema baixa o `senha_hash` do usuário e compara localmente. A tela de cadastro de usuários também baixa o `senha_hash` de todo mundo.

- **Por que é perigoso:** combinado com o RLS aberto (Seção 4), **qualquer um com a anon key baixa o `senha_hash` de todos os usuários** (`select senha_hash from concrem_usuarios`) e leva para **quebra offline** (tentar adivinhar a senha sem limite, no computador do atacante). 
  - **Nuance importante (e elogio):** o algoritmo de hash em [src/lib/password.ts](src/lib/password.ts) é **bom** — PBKDF2-SHA256, 210.000 iterações, com salt aleatório e comparação em tempo constante. Isso torna a quebra offline **cara**, especialmente para senhas fortes. Então o problema **não** é o algoritmo; é **expor o hash** e **comparar a senha no cliente**.

- **Como corrigir (a correção certa):**
  1. **Migre para o Supabase Auth.** Aí a senha **nunca** trafega comparação no cliente; o Supabase guarda e verifica o hash no servidor, e o front recebe só um token de sessão. O `senha_hash` deixa de existir no seu schema.
  2. Se (por ora) mantiver a tabela própria: **nunca** faça `select` da coluna `senha_hash` no cliente. A verificação de senha tem que ser numa **função de servidor** (Edge Function) que recebe e-mail+senha, compara internamente e devolve só "ok/não ok" + um token. Com RLS, **negue leitura da coluna `senha_hash`** para `anon`/`authenticated`.

### 5.2 — 🟡 MÉDIA — Sessão guardada de forma forjável no `sessionStorage`

- **Onde:** [src/contexts/AppContext.tsx:588-590](src/contexts/AppContext.tsx#L588-L590) (`sessionStorage.getItem('auth_token') === 'true'`), [683-684](src/contexts/AppContext.tsx#L683-L684) e [592-610](src/contexts/AppContext.tsx#L592-L610) (`auth_user` com nome/perfil/permissões em JSON).
- **O que é:** o "estou logado" é só `sessionStorage.auth_token === 'true'`, e o perfil/permissões vêm de um JSON em `auth_user` no próprio navegador.
- **Por que é perigoso:** qualquer usuário pode abrir o console e fazer `sessionStorage.setItem('auth_token','true')` e colar um `auth_user` com `role: 'ADMIN'` — e a **interface** passa a tratá-lo como admin. Isso **só** não vira acesso total porque… na verdade vira, por causa do RLS aberto (Seção 4). Mesmo após corrigir o RLS, a sessão precisa ser um **token real** verificado no servidor.
- **Como corrigir:** com Supabase Auth, a sessão passa a ser um JWT assinado que o servidor valida — não dá para forjar `role: ADMIN` localmente. As permissões de tela podem continuar no cliente para UX, mas a **trava real** é o RLS + o token.

### 5.3 — 🟠 ALTA — Senhas em **texto puro** no `localStorage` (login de fallback)

- **Onde:**
  - [src/contexts/AppContext.tsx:99](src/contexts/AppContext.tsx#L99) — tipo `AppUser` tem `password: string` (texto puro).
  - [src/contexts/AppContext.tsx:569-585](src/contexts/AppContext.tsx#L569-L585) — `users` é lido/gravado em `localStorage['app_users']` com esse campo `password`.
  - [src/contexts/AppContext.tsx:693](src/contexts/AppContext.tsx#L693) — login de fallback: `users.find(u => u.username === username && u.password === password)` (comparação de senha em **texto puro**).
- **O que é:** existe um caminho de login alternativo que compara senha **sem hash nenhum**, e os usuários ficam em `localStorage` (que **persiste** mesmo fechando o navegador) com a senha legível.
- **Por que é perigoso:** se houver qualquer registro em `app_users`, a senha está **legível** para quem usar aquele computador (ou para um XSS). Hoje o `seedUsers` está vazio ([AppContext.tsx:281](src/contexts/AppContext.tsx#L281)), o que **reduz** o risco — mas o mecanismo continua no código e a senha-padrão `'1234'` ([AppContext.tsx:103](src/contexts/AppContext.tsx#L103)) é aplicada a qualquer usuário sem senha.
- **Como corrigir:** remover o login de fallback por `localStorage`/texto puro assim que o Supabase Auth estiver no lugar; não persistir senha no navegador em hipótese alguma.

---

## 6. Google Fonts (baixa prioridade)

- **Onde:**
  - [index.html:8-10](index.html#L8-L10) — `preconnect` para `fonts.googleapis.com`/`fonts.gstatic.com` e `<link>` da fonte **Manrope**.
  - [vercel.json:13](vercel.json#L13) — a política CSP (`Content-Security-Policy-Report-Only`) já libera `fonts.googleapis.com` (style) e `fonts.gstatic.com` (font).
- **O que é:** a fonte Manrope é baixada dos servidores do Google a cada visita.
- **Por que pode importar:** (1) **privacidade/LGPD** — o navegador do usuário faz uma requisição ao Google a cada acesso, expondo IP/*user agent* a um terceiro; (2) **dependência externa** — se o Google estiver indisponível ou bloqueado, a fonte falha; (3) é um *host* a mais para confiar na sua CSP.
- **É viável self-hostar?** **Sim, e é simples.** A fonte Manrope tem licença aberta (SIL OFL), então você pode servir os arquivos do seu próprio domínio.
  - **Passo a passo (quando for implementar — não implementei nada):**
    1. Use o pacote `@fontsource/manrope` (`npm i @fontsource/manrope`) e `import '@fontsource/manrope'` no código, **ou** baixe os `.woff2` e ponha em `public/fonts/` com um `@font-face` no CSS.
    2. Remova as 3 linhas de `<link>`/`preconnect` do Google no [index.html](index.html).
    3. Na CSP do [vercel.json](vercel.json), remova `https://fonts.googleapis.com` e `https://fonts.gstatic.com` e deixe `font-src 'self'`.
  - **Benefício extra:** elimina 2 origens externas da CSP, deixando-a mais fechada.
- **Observação positiva:** o `vercel.json` já tem uma CSP (em modo `Report-Only`) bem estruturada (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`). Vale o plano de, no futuro, promovê-la de `Report-Only` para CSP ativa (`Content-Security-Policy`) após validar que nada quebra.

---

## ✅ Resumo priorizado

| # | Achado | Severidade | Onde | Ação |
|---|---|---|---|---|
| 1 | **Banco aberto via anon key**: RLS permissivo (`using(true)`) + GRANT total para `anon` | 🔴 Crítica | [ops_cadastros_rls_grants.sql](supabase/migrations/ops_cadastros_rls_grants.sql), [ops_ops_tables_rls_grants_v2.sql](supabase/migrations/ops_ops_tables_rls_grants_v2.sql) | Reescrever políticas restritivas; remover GRANTs para anon (§4.1) |
| 2 | **RLS aplicado a tabelas erradas** (sem prefixo `concrem_`) → tabelas reais provavelmente sem RLS | 🔴 Crítica | migrations §4.2 | Confirmar no banco e refazer políticas nos nomes `concrem_*` (§4.2) |
| 3 | **`senha_hash` exposto ao navegador** + verificação de senha no cliente | 🔴 Crítica | [AppContext.tsx:644-652](src/contexts/AppContext.tsx#L644-L652), [cadastrosOps.ts:214](src/lib/cadastrosOps.ts#L214) | Migrar p/ Supabase Auth; nunca dar `select` em `senha_hash` (§5.1) |
| 4 | **Chave da Evolution API (WhatsApp) pública no bundle** | 🔴 Crítica | [.env:13](.env#L13), [evolutionApi.ts:11](src/lib/evolutionApi.ts#L11) | Rotacionar chave + mover envio p/ servidor (§1.1) |
| 5 | **Gestão de usuários/permissões e financeiro graváveis via anon** (autorização só no cliente) | 🔴 Crítica | [cadastrosOps.ts:231-283](src/lib/cadastrosOps.ts#L231-L283), [opsRepo.ts:484-510](src/lib/opsRepo.ts#L484-L510) | Resolve-se com §4 (RLS real) |
| 6 | **Senhas em texto puro no `localStorage`** (login de fallback) | 🟠 Alta | [AppContext.tsx:99](src/contexts/AppContext.tsx#L99), [693](src/contexts/AppContext.tsx#L693) | Remover fallback após Supabase Auth (§5.3) |
| 7 | **Resend projetado p/ rodar no navegador** (chave vazaria se preenchida) | 🟠 Alta | [ComercialConfirmacao.tsx:373-391](src/pages/ComercialConfirmacao.tsx#L373-L391) | Não preencher `VITE_RESEND_*`; mover p/ servidor (§1.2) |
| 8 | **Exclusões/escritas operacionais via anon** | 🟠 Alta | [opsRepo.ts](src/lib/opsRepo.ts) (vários `delete`) | Resolve-se com §4 |
| 9 | **Sessão forjável no `sessionStorage`** (`auth_token='true'`) | 🟡 Média | [AppContext.tsx:588-590](src/contexts/AppContext.tsx#L588-L590) | Token real via Supabase Auth (§5.2) |
| 10 | **Bucket Storage `relatorio-entrega`** — checar políticas/visibilidade | 🟡 Média | [CarregamentoDashboard.tsx:408-539](src/pages/CarregamentoDashboard.tsx#L408-L539) | Aplicar RLS de Storage; revisar `getPublicUrl` (§2.3) |
| 11 | **`.env` fora do `.gitignore`** + anon key real no `.env.example` | 🔵 Baixa | [.gitignore](.gitignore), [.env.example:6](.env.example#L6) | Ignorar `.env*`; esvaziar exemplo (§1.3) |
| 12 | **Tabela `concrem_pedidos_sistema` fora do inventário** (fallback inconsistente) | 🔵 Baixa | ~15 arquivos (§2.3) | Padronizar/validar nome real da tabela (§2.3) |
| 13 | **Google Fonts externo** | 🔵 Baixa | [index.html:8-10](index.html#L8-L10) | Self-host Manrope (§6) |

### A ordem que eu recomendo seguir

1. **Resolver o RLS (achados 1 e 2) — é a raiz de quase tudo.** Confirme no banco (queries da §4.2), depois reescreva as políticas para os nomes `concrem_*` de forma restritiva. Enquanto a anon tiver acesso de escrita, os achados 3, 5 e 8 continuam exploráveis.
2. **Parar de expor `senha_hash` (achado 3)** e **rotacionar a chave da Evolution (achado 4)** — são ações rápidas e de alto impacto.
3. **Migrar para Supabase Auth** — isso destrava de uma vez os achados 3, 5, 6, 8 e 9, porque dá um conceito real de "usuário logado" para o RLS usar.
4. Tratar Storage (10), higiene de segredos (7, 11), e por fim os itens cosméticos (12, 13).

---

> **Reforço final:** esta auditoria foi **somente leitura**. Nenhuma migration foi executada, nenhum build foi rodado, nenhum dado foi tocado e nada foi commitado. As queries SQL sugeridas na §4.2 são de **diagnóstico** (apenas `select`) e devem ser executadas por você, conscientemente, no painel do Supabase.
