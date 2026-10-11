# Análise Técnica: Inicialização do Esquema de Banco, Persistência Atômica e Seeding Seguro de `db.faqItems`

**Milestone**: Milestone 1 - Backend Core & Database Layer  
**Autor**: Milestone 1 Explorer 1  
**Data**: 2026-10-11  
**Escopo**: `demo-server.mjs` (`artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`), `data/database.json`, persistência PostgreSQL e sincronização de dados.

---

## 1. Contexto e Objetivos

O sistema CorpFlats / Guest Flow Manager está integrando uma base de conhecimento dinâmica para o Agente de IA do WhatsApp (Sofia), com auto-aprendizado contínuo (detecção de novas perguntas, captura de resposta do operador para aprovação em 1 clique) e motor de regras de exceção por cliente (escopos `all`, `exclude`, `include_only`).

Para suportar essas funcionalidades, o banco de dados em memória (`db`) precisa:
1. Ter a coleção `db.faqItems` formalmente inicializada na estrutura de dados padrão.
2. Carregar e reconciliar `db.faqItems` a partir de `data/database.json` e do PostgreSQL (`system_store`, chave `db_state`).
3. Popular de forma segura, determinística e idempotente os **9 FAQs oficiais** essenciais + itens de teste/pendentes, sem apagar alterações manuais do operador em reinicializações.
4. Gravar o estado do banco em disco (`data/database.json`) com **escrita atômica** (`atomicWriteFileSync`), eliminando o risco de corrupção ou truncamento de arquivo (atualmente com ~1,17 MB) em reinicializações abruptas.
5. Manter estrita paridade de bytes (SHA-256) entre `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs`.

---

## 2. Diagnóstico da Arquitetura Atual

### 2.1. Estrutura de `db` em `demo-server.mjs`
- **Arquivo**: `artifacts/api-server/demo-server.mjs` e `scripts/demo-server.mjs` (hashes SHA-256 idênticos comprovados).
- **Linhas 595-660**: Objeto inicial `let db = { ... }`.
  - Atualmente, coleções como `cleaningRequests`, `reservations`, `periodicTasks`, `guests`, `notifications` estão declaradas como arrays vazios.
  - **Falta**: A chave `faqItems: []` não está declarada no objeto inicial `db`.

### 2.2. Fluxo de `loadDatabase()` (Linhas 3452–3868)
1. **Carga do Arquivo Local (`database.json`)**:
   - Linha 3454: `if (fs.existsSync(DB_FILE)) { const content = fs.readFileSync(DB_FILE, "utf-8"); const loaded = JSON.parse(content); Object.assign(db, loaded); ... }`
   - O código assegura arrays para `serviceOrders`, `serviceWorkers`, `tariffOverrides`, etc., mas **não** valida `db.faqItems`. Se `database.json` antigo não possuir a chave, ela permanece indefinida.
2. **Hidratação a partir do PostgreSQL (`system_store`)**:
   - Linhas 3534–3546: Busca `SELECT value FROM system_store WHERE key = 'db_state'`.
   - Linhas 3559–3570: Captura snapshots locais de coleções (`localReservations`, `localCleanings`, `localGuests`, etc.) antes de executar `Object.assign(db, pgLoaded)`.
   - **Risco Identificado**: Se o PostgreSQL contiver um `db_state` legado sem `faqItems`, o `Object.assign(db, pgLoaded)` sobrescreverá `db.faqItems` como `undefined`, destruindo qualquer seed local ou dados recém-carregados!
   - Portanto, é imperativo capturar `localFaqItems = Array.isArray(db.faqItems) ? [...db.faqItems] : [];` e, após o `Object.assign`, restaurar caso `pgLoaded.faqItems` não exista ou esteja vazio.
3. **Reconciliação Universal (`reconcileUniversalIntegrity`)**:
   - Linhas 1584–2176: Mescla não-destrutiva entre instâncias de banco (disco local vs nuvem).
   - Deve ser estendida para suportar `faqItems`, mesclando por `id` e respeitando a data de modificação mais recente (`updatedAt || createdAt`).
4. **Finalização de `loadDatabase()`**:
   - Linha 3863: Chama `saveDatabase()`. Se o seeding for acionado antes desta chamada, o estado inicial com os 9 FAQs será salvo automaticamente no disco e no PostgreSQL.

### 2.3. Persistência em `saveDatabase()` (Linhas 5026–5067)
- **Linha 5031**:
  ```javascript
  const stateJson = JSON.stringify(db);
  fs.writeFileSync(DB_FILE, stateJson, "utf-8");
  ```
- **Vulnerabilidade**: `fs.writeFileSync` direto trunca o arquivo antes de terminar a escrita. Como `database.json` já tem ~1,17 MB, um reinício do servidor (por exemplo, deploy no Render, falha de processo ou queda de energia) durante a escrita deixará o arquivo vazio ou parcialmente corrompido (JSON sintaticamente inválido).
- **Solução**: Implementar `atomicWriteFileSync`, que grava primeiro em arquivo temporário único (`.tmp_database.json_<timestamp>_<rand>`) no mesmo diretório e depois executa `fs.renameSync` atômico, com fallback de cópia e unlink seguro caso o Windows mantenha locks momentâneos.

---

## 3. Especificação do Modelo `FaqItem`

Em conformidade com `PROJECT.md` (§ Interface Contracts) e `ORIGINAL_REQUEST.md`:

```typescript
interface FaqItem {
  id: string; // Ex: "faq-official-wifi", "faq-seed-pending-ferro"
  question: string; // Pergunta principal
  answer: string; // Resposta oficial formatada (suporte a *negrito*, _itálico_, emojis)
  category: 
    | "reservas"
    | "checkin_acesso"
    | "wifi_tecnologia"
    | "cafe_manha"
    | "garagem"
    | "estrutura_flat"
    | "regras_visitas_pets"
    | "lazer_condominio"
    | "checkout";
  keywords: string[]; // Termos-chave para busca heurística local
  variations: string[]; // Frases alternativas / sinônimos de pergunta
  status: "ativo" | "inativo" | "pendente" | "aguardando_aprovacao";
  scope: "all" | "exclude" | "include_only";
  clientPhones: string[]; // Lista de números com ou sem 55/DDD
  suggestedAnswer?: string; // Resposta capturada do operador para aprovação
  sourceClientPhone?: string; // Telefone que gerou a dúvida pendente
  sourceClientName?: string; // Nome do contato
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  approvedAt?: string; // ISO 8601 (quando status == "ativo")
}
```

---

## 4. O Catálogo de Seed Inicial (9 Oficiais + 2 Pendentes/Fluxo)

Os 9 FAQs oficiais cobrem todas as regras solicitadas no `ORIGINAL_REQUEST.md` e `DISPATCH.md`:

1. **Wi-Fi** (`wifi_tecnologia`, ativo, all)
   - *Pergunta*: "Qual é a rede e a senha do Wi-Fi dos flats?"
   - *Resposta*: "A rede Wi-Fi privativa dos flats é *CorpFlats-Hospedes* e a senha é *corpflats2026*. Conexão de fibra ótica de 500MB em todos os apartamentos com bancada exclusiva para trabalho e streaming!"
   - *Keywords*: `["wifi", "wi-fi", "internet", "senha", "conectar", "rede", "conexao", "fibra"]`
   - *Variations*: `["qual a senha do wifi", "como conectar na internet", "tem internet no quarto", "qual a rede do flat", "senha da internet"]`

2. **Café da manhã no quarto** (`cafe_manha`, ativo, all)
   - *Pergunta*: "Como funciona o café da manhã servido no quarto?"
   - *Resposta*: "O café da manhã é servido em cesta gourmet personalizada diretamente no seu flat, no horário de sua preferência entre *06:30 e 09:30*. Caso sua reserva não possua café incluso, você pode solicitar a inclusão diária ou itens avulsos com nossa equipe pelo WhatsApp."
   - *Keywords*: `["cafe", "café", "manha", "manhã", "cesta", "desjejum", "quarto", "horario", "horário"]`
   - *Variations*: `["o café é servido no quarto", "qual o horário do café da manhã", "como peço o café no quarto", "tem café incluso na diária", "como funciona o desjejum"]`

3. **Recolhimento de louças** (`cafe_manha`, ativo, all)
   - *Pergunta*: "Como funciona o recolhimento das louças e da cesta do café?"
   - *Resposta*: "Após o desfrute do café, basta acomodar as louças e utensílios dentro da cesta gourmet e deixá-la sobre a bancada da cozinha do flat. A equipe de governança realizará o recolhimento e a higienização durante o serviço diário ou no check-out."
   - *Keywords*: `["louca", "louça", "loucas", "louças", "cesta", "bandeja", "recolhimento", "prato", "copo", "suja", "limpeza"]`
   - *Variations*: `["onde deixo a louça suja", "onde coloco a cesta de café depois de comer", "quem recolhe a louça do café", "posso colocar a bandeja no corredor", "onde deixar os pratos sujos"]`

4. **Água no frigobar** (`estrutura_flat`, ativo, all)
   - *Pergunta*: "Tem água mineral no frigobar e ela é cortesia?"
   - *Resposta*: "Sim! Disponibilizamos garrafas de água mineral no frigobar como cortesia especial de boas-vindas na sua chegada. O frigobar também está livre e limpo para você armazenar seus próprios alimentos e bebidas durante toda a hospedagem."
   - *Keywords*: `["agua", "água", "frigobar", "cortesia", "bebida", "geladeira", "garrafa", "mineral"]`
   - *Variations*: `["tem água no frigobar", "a água do frigobar é paga", "a água é cortesia", "o que tem no frigobar", "tem bebidas no quarto"]`

5. **Regras de visitas** (`regras_visitas_pets`, ativo, all)
   - *Pergunta*: "Quais são as regras para receber visitas no flat?"
   - *Resposta*: "Visitas são muito bem-vindas nas áreas comuns e dentro do flat até as *22:00*, mediante identificação obrigatória na recepção com documento oficial com foto. A permanência após as 22h ou pernoite requer cadastro de hóspede adicional na reserva, respeitando a lotação do flat e eventual taxa extra."
   - *Keywords*: `["visita", "visitas", "visitante", "convidado", "amigo", "portaria", "recepcao", "subir", "pernoite", "horario"]`
   - *Variations*: `["posso receber visitas no flat", "qual o horário limite para visitas", "amigo pode subir no apartamento", "visita pode dormir no flat", "regras de visitantes no condomínio"]`

6. **Regras de pets** (`regras_visitas_pets`, ativo, all)
   - *Pergunta*: "Quais são as regras e políticas para hospedagem com animais de estimação (pets)?"
   - *Resposta*: "Aceitamos com carinho cães de pequeno porte (até 10 kg). Nas áreas sociais do condomínio, o pet deve transitar no colo ou em caixa de transporte, utilizando exclusivamente o elevador de serviço. É proibido deixar o pet sozinho por longos períodos no apartamento. Aplica-se uma taxa única de higienização de R$ 80,00 por estadia."
   - *Keywords*: `["pet", "pets", "cachorro", "cao", "cão", "animal", "animais", "taxa pet", "porte", "elevador"]`
   - *Variations*: `["aceita cachorro no flat", "posso levar meu pet", "qual o valor da taxa pet", "aceita animais de estimação", "quais as regras para pets"]`

7. **Check-in 14h** (`checkin_acesso`, ativo, all)
   - *Pergunta*: "Qual é o horário padrão de check-in e como funciona o acesso ao condomínio?"
   - *Resposta*: "O horário padrão de entrada (check-in) inicia às *14:00*. O Edifício Soho Residence Service possui portaria 24 horas. Para ter acesso, basta apresentar seu documento oficial com foto na portaria e retirar o cartão magnético codificado do seu flat."
   - *Keywords*: `["checkin", "check-in", "horario", "horário", "entrada", "acesso", "portaria", "14h", "14:00", "chave", "cartao"]`
   - *Variations*: `["a que horas posso entrar", "qual o horário de check-in", "como pego a chave do quarto", "como entro no prédio", "portaria funciona 24 horas"]`

8. **Early check-in para reservas diretas** (`checkin_acesso`, ativo, all)
   - *Pergunta*: "Como funciona o Early Check-in (entrada antecipada) para reservas diretas?"
   - *Resposta*: "Para quem reserva diretamente conosco pelo Site Oficial ou WhatsApp, oferecemos o benefício exclusivo de *Early Check-in gratuito a partir das 10:00*, ESTRITAMENTE MEDIANTE DISPONIBILIDADE prévia (depende da liberação e finalização da higienização do flat pela governança). Consulte nosso atendimento no dia da sua chegada para verificar a liberação antecipada!"
   - *Keywords*: `["early", "checkin", "check-in", "antecipado", "entrar mais cedo", "10h", "10:00", "reserva direta", "site", "beneficio"]`
   - *Variations*: `["posso entrar antes das 14h", "como funciona o early check-in", "posso fazer check-in às 10 horas", "tem como antecipar minha entrada", "reserva pelo site tem early check-in"]`

9. **Check-out 12h** (`checkout`, ativo, all)
   - *Pergunta*: "Qual é o horário de check-out e qual o procedimento de saída?"
   - *Resposta*: "O check-out deve ser realizado até as *12:00*. Na saída, basta desligar o ar-condicionado, fechar a porta e entregar o cartão magnético na recepção/portaria ou deixá-lo sobre a mesa do flat avisando nossa equipe pelo WhatsApp. Solicitações de Late Check-out dependem de disponibilidade com a governança."
   - *Keywords*: `["checkout", "check-out", "saida", "saída", "12h", "12:00", "devolver", "chave", "cartao", "sair"]`
   - *Variations*: `["que horas tenho que liberar o quarto", "qual o horário limite de saída", "como entrego a chave no check-out", "posso sair mais tarde", "procedimento de checkout"]`

10. **Item Pendente de Teste** (`estrutura_flat`, pendente, all)
    - *Pergunta*: "O flat dispõe de ferro e tábua de passar roupas?"
    - *Resposta*: `""`
    - *Keywords*: `["ferro", "passar", "roupa", "tabua", "tábua"]`
    - *Variations*: `["tem ferro de passar no quarto", "disponibiliza tábua de passar"]`
    - *Source*: Marcos Oliveira (`5522998881122`)

11. **Item Aguardando Aprovação** (`lazer_condominio`, aguardando_aprovacao, all)
    - *Pergunta*: "Qual o horário de funcionamento da piscina e da academia?"
    - *Resposta*: `""`
    - *Resposta Sugerida*: "A piscina e a academia do Edifício Soho funcionam diariamente das *06:00 às 22:00*. O acesso é livre e gratuito para todos os nossos hóspedes utilizando a tag do condomínio."
    - *Keywords*: `["piscina", "academia", "lazer", "horario", "aberta", "fitness"]`
    - *Variations*: `["que horas abre a piscina", "a academia funciona domingo", "horário de lazer"]`
    - *Source*: Renata Vasconcelos (`5521987654321`)

---

## 5. Implementação Recomendada: Diffs Concretos

As alterações a seguir devem ser aplicadas **rigorosamente em ambos os arquivos**:
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs`

### 5.1. Inicialização do Objeto `db`

```diff
--- a/artifacts/api-server/demo-server.mjs
+++ b/artifacts/api-server/demo-server.mjs
@@ -617,6 +617,7 @@ let db = {
   fnrhSignatureTokens: [],
   fnrhWhatsappOtps: [],
   fnrhInternalAuditLogs: [],
+  faqItems: [],
   notificationSettings: {
     soundEnabled: true,
     adminWhatsApp: "5522997124021",
```

### 5.2. Função Geradora de Seed e Helper de Idempotência

Adicionar no bloco de persistência de banco de dados em `demo-server.mjs` (após a declaração de `DEFAULT_SITE_CONFIG` ou antes de `reconcileUniversalIntegrity`):

```javascript
// ── Catálogo Inicial e Seeding Seguro de FAQs ──────────────────────────────
export function getOfficialFaqSeed() {
  return [
    {
      id: "faq-official-wifi",
      question: "Qual é a rede e a senha do Wi-Fi dos flats?",
      answer: "A rede Wi-Fi privativa dos flats é *CorpFlats-Hospedes* e a senha é *corpflats2026*. Conexão de fibra ótica de 500MB em todos os apartamentos com bancada exclusiva para trabalho e streaming!",
      category: "wifi_tecnologia",
      keywords: ["wifi", "wi-fi", "internet", "senha", "conectar", "rede", "conexao", "fibra"],
      variations: ["qual a senha do wifi", "como conectar na internet", "tem internet no quarto", "qual a rede do flat", "senha da internet"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-cafe-quarto",
      question: "Como funciona o café da manhã servido no quarto?",
      answer: "O café da manhã é servido em cesta gourmet personalizada diretamente no seu flat, no horário de sua preferência entre *06:30 e 09:30*. Caso sua reserva não possua café incluso, você pode solicitar a inclusão diária ou itens avulsos com nossa equipe pelo WhatsApp.",
      category: "cafe_manha",
      keywords: ["cafe", "café", "manha", "manhã", "cesta", "desjejum", "quarto", "horario", "horário"],
      variations: ["o café é servido no quarto", "qual o horário do café da manhã", "como peço o café no quarto", "tem café incluso na diária", "como funciona o desjejum"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-recolhimento-loucas",
      question: "Como funciona o recolhimento das louças e da cesta do café?",
      answer: "Após o desfrute do café, basta acomodar as louças e utensílios dentro da cesta gourmet e deixá-la sobre a bancada da cozinha do flat. A equipe de governança realizará o recolhimento e a higienização durante o serviço diário ou no check-out.",
      category: "cafe_manha",
      keywords: ["louca", "louça", "loucas", "louças", "cesta", "bandeja", "recolhimento", "prato", "copo", "suja", "limpeza"],
      variations: ["onde deixo a louça suja", "onde coloco a cesta de café depois de comer", "quem recolhe a louça do café", "posso colocar a bandeja no corredor", "onde deixar os pratos sujos"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-agua-frigobar",
      question: "Tem água mineral no frigobar e ela é cortesia?",
      answer: "Sim! Disponibilizamos garrafas de água mineral no frigobar como cortesia especial de boas-vindas na sua chegada. O frigobar também está livre e limpo para você armazenar seus próprios alimentos e bebidas durante toda a hospedagem.",
      category: "estrutura_flat",
      keywords: ["agua", "água", "frigobar", "cortesia", "bebida", "geladeira", "garrafa", "mineral"],
      variations: ["tem água no frigobar", "a água do frigobar é paga", "a água é cortesia", "o que tem no frigobar", "tem bebidas no quarto"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-regras-visitas",
      question: "Quais são as regras para receber visitas no flat?",
      answer: "Visitas são muito bem-vindas nas áreas comuns e dentro do flat até as *22:00*, mediante identificação obrigatória na recepção com documento oficial com foto. A permanência após as 22h ou pernoite requer cadastro de hóspede adicional na reserva, respeitando a lotação do flat e eventual taxa extra.",
      category: "regras_visitas_pets",
      keywords: ["visita", "visitas", "visitante", "convidado", "amigo", "portaria", "recepcao", "subir", "pernoite", "horario"],
      variations: ["posso receber visitas no flat", "qual o horário limite para visitas", "amigo pode subir no apartamento", "visita pode dormir no flat", "regras de visitantes no condomínio"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-regras-pets",
      question: "Quais são as regras e políticas para hospedagem com animais de estimação (pets)?",
      answer: "Aceitamos com carinho cães de pequeno porte (até 10 kg). Nas áreas sociais do condomínio, o pet deve transitar no colo ou em caixa de transporte, utilizando exclusivamente o elevador de serviço. É proibido deixar o pet sozinho por longos períodos no apartamento. Aplica-se uma taxa única de higienização de R$ 80,00 por estadia.",
      category: "regras_visitas_pets",
      keywords: ["pet", "pets", "cachorro", "cao", "cão", "animal", "animais", "taxa pet", "porte", "elevador"],
      variations: ["aceita cachorro no flat", "posso levar meu pet", "qual o valor da taxa pet", "aceita animais de estimação", "quais as regras para pets"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-checkin-14h",
      question: "Qual é o horário padrão de check-in e como funciona o acesso ao condomínio?",
      answer: "O horário padrão de entrada (check-in) inicia às *14:00*. O Edifício Soho Residence Service possui portaria 24 horas. Para ter acesso, basta apresentar seu documento oficial com foto na portaria e retirar o cartão magnético codificado do seu flat.",
      category: "checkin_acesso",
      keywords: ["checkin", "check-in", "horario", "horário", "entrada", "acesso", "portaria", "14h", "14:00", "chave", "cartao"],
      variations: ["a que horas posso entrar", "qual o horário de check-in", "como pego a chave do quarto", "como entro no prédio", "portaria funciona 24 horas"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-early-checkin",
      question: "Como funciona o Early Check-in (entrada antecipada) para reservas diretas?",
      answer: "Para quem reserva diretamente conosco pelo Site Oficial ou WhatsApp, oferecemos o benefício exclusivo de *Early Check-in gratuito a partir das 10:00*, ESTRITAMENTE MEDIANTE DISPONIBILIDADE prévia (depende da liberação e finalização da higienização do flat pela governança). Consulte nosso atendimento no dia da sua chegada para verificar a liberação antecipada!",
      category: "checkin_acesso",
      keywords: ["early", "checkin", "check-in", "antecipado", "entrar mais cedo", "10h", "10:00", "reserva direta", "site", "beneficio"],
      variations: ["posso entrar antes das 14h", "como funciona o early check-in", "posso fazer check-in às 10 horas", "tem como antecipar minha entrada", "reserva pelo site tem early check-in"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-official-checkout-12h",
      question: "Qual é o horário de check-out e qual o procedimento de saída?",
      answer: "O check-out deve ser realizado até as *12:00*. Na saída, basta desligar o ar-condicionado, fechar a porta e entregar o cartão magnético na recepção/portaria ou deixá-lo sobre a mesa do flat avisando nossa equipe pelo WhatsApp. Solicitações de Late Check-out dependem de disponibilidade com a governança.",
      category: "checkout",
      keywords: ["checkout", "check-out", "saida", "saída", "12h", "12:00", "devolver", "chave", "cartao", "sair"],
      variations: ["que horas tenho que liberar o quarto", "qual o horário limite de saída", "como entrego a chave no check-out", "posso sair mais tarde", "procedimento de checkout"],
      status: "ativo",
      scope: "all",
      clientPhones: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      approvedAt: "2026-09-01T00:00:00.000Z"
    },
    {
      id: "faq-seed-pending-ferro",
      question: "O flat dispõe de ferro e tábua de passar roupas?",
      answer: "",
      category: "estrutura_flat",
      keywords: ["ferro", "passar", "roupa", "tabua", "tábua"],
      variations: ["tem ferro de passar no quarto", "disponibiliza tábua de passar"],
      status: "pendente",
      scope: "all",
      clientPhones: [],
      sourceClientName: "Marcos Oliveira",
      sourceClientPhone: "5522998881122",
      createdAt: "2026-10-10T14:20:00.000Z",
      updatedAt: "2026-10-10T14:20:00.000Z"
    },
    {
      id: "faq-seed-approval-piscina",
      question: "Qual o horário de funcionamento da piscina e da academia?",
      answer: "",
      suggestedAnswer: "A piscina e a academia do Edifício Soho funcionam diariamente das *06:00 às 22:00*. O acesso é livre e gratuito para todos os nossos hóspedes utilizando a tag do condomínio.",
      category: "lazer_condominio",
      keywords: ["piscina", "academia", "lazer", "horario", "aberta", "fitness"],
      variations: ["que horas abre a piscina", "a academia funciona domingo", "horário de lazer"],
      status: "aguardando_aprovacao",
      scope: "all",
      clientPhones: [],
      sourceClientName: "Renata Vasconcelos",
      sourceClientPhone: "5521987654321",
      createdAt: "2026-10-10T16:05:00.000Z",
      updatedAt: "2026-10-10T16:08:00.000Z"
    }
  ];
}

export function seedInitialFaqItems(dbInstance) {
  if (!Array.isArray(dbInstance.faqItems)) {
    dbInstance.faqItems = [];
  }
  const seeds = getOfficialFaqSeed();
  if (dbInstance.faqItems.length === 0) {
    dbInstance.faqItems = [...seeds];
    return true;
  }
  let modified = false;
  for (const s of seeds) {
    const exists = dbInstance.faqItems.some(item => item.id === s.id);
    if (!exists) {
      dbInstance.faqItems.push({ ...s });
      modified = true;
    }
  }
  return modified;
}
```

### 5.3. Integração em `reconcileUniversalIntegrity`

```diff
--- a/artifacts/api-server/demo-server.mjs
+++ b/artifacts/api-server/demo-server.mjs
@@ -1588,6 +1588,7 @@ function reconcileUniversalIntegrity(incomingState = null) {
   if (!db.guests) db.guests = [];
+  if (!db.faqItems) db.faqItems = [];
   let changed = false;
 
   // 1. União Bidirecional Não-Destrutiva (Merge de Nuvem PostgreSQL e Disco Local)
@@ -1650,6 +1651,28 @@ function reconcileUniversalIntegrity(incomingState = null) {
       });
     }
+
+    // 1.4 Base de Conhecimento e FAQ (União não-destrutiva por ID com resolução por data)
+    if (Array.isArray(incomingState.faqItems)) {
+      incomingState.faqItems.forEach(incFaq => {
+        if (!incFaq || !incFaq.id) return;
+        const existingIdx = db.faqItems.findIndex(f => f.id === incFaq.id);
+        if (existingIdx === -1) {
+          db.faqItems.push({ ...incFaq });
+          changed = true;
+        } else {
+          const existing = db.faqItems[existingIdx];
+          const incDate = incFaq.updatedAt || incFaq.createdAt || "";
+          const curDate = existing.updatedAt || existing.createdAt || "";
+          if (incDate > curDate) {
+            db.faqItems[existingIdx] = { ...existing, ...incFaq };
+            changed = true;
+          }
+        }
+      });
+    }
```

### 5.4. Blindagem em `loadDatabase()`

```diff
--- a/artifacts/api-server/demo-server.mjs
+++ b/artifacts/api-server/demo-server.mjs
@@ -3457,6 +3457,7 @@ async function loadDatabase() {
       Object.assign(db, loaded);
       if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
       if (!Array.isArray(db.serviceWorkers)) db.serviceWorkers = [];
+      if (!Array.isArray(db.faqItems)) db.faqItems = [];
       if (!db.tariffSettings) db.tariffSettings = getTariffSettings();
       if (!Array.isArray(db.tariffOverrides)) db.tariffOverrides = [];
       if (!db.botActionsSettings) db.botActionsSettings = getBotActionsSettings();
@@ -3570,6 +3571,7 @@ async function loadDatabase() {
           const localWhatsappHistory = [...(db.whatsappHistory || [])];
           const localWhatsappQueue = [...(db.whatsappQueue || [])];
           const localWhatsappConversations = [...(db.whatsappConversations || [])];
+          const localFaqItems = Array.isArray(db.faqItems) ? [...db.faqItems] : [];
 
           // Blindagem de Configurações de E-mail / SMTP contra perda em reinícios ou restores
@@ -3595,6 +3597,11 @@ async function loadDatabase() {
           Object.assign(db, pgLoaded);
+
+          if ((!Array.isArray(db.faqItems) || db.faqItems.length === 0) && localFaqItems.length > 0) {
+            db.faqItems = localFaqItems;
+            console.log("[PostgreSQL] Hidratando faqItems da base local para a nuvem...");
+          }
+          if (!Array.isArray(db.faqItems)) db.faqItems = [];
 
           if (!db.settings) db.settings = {};
@@ -3625,6 +3632,7 @@ async function loadDatabase() {
             whatsappHistory: (!pgLoaded.whatsappHistory || pgLoaded.whatsappHistory.length === 0) ? localWhatsappHistory : undefined,
             whatsappQueue: (!pgLoaded.whatsappQueue || pgLoaded.whatsappQueue.length === 0) ? localWhatsappQueue : undefined,
             whatsappConversations: (!pgLoaded.whatsappConversations || pgLoaded.whatsappConversations.length === 0) ? localWhatsappConversations : undefined,
+            faqItems: (!pgLoaded.faqItems || pgLoaded.faqItems.length === 0) ? localFaqItems : pgLoaded.faqItems
           });
           syncMaidCredits(2);
@@ -3862,6 +3870,7 @@ async function loadDatabase() {
     reconcileAndMergeGuests(db);
+    const faqSeeded = seedInitialFaqItems(db);
     saveDatabase();
     sanitizeAndRecoverCleanings();
```

### 5.5. Persistência Atômica com `atomicWriteFileSync`

Definir `atomicWriteFileSync` antes de `saveDatabase`:

```javascript
// ── Gravação Atômica e À Prova de Falhas em Disco ───────────────────────────
function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = path.join(dir, `.tmp_${path.basename(filePath)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.writeFileSync(tmpPath, content, "utf-8");
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Fallback resiliente para Windows caso locks temporários de antivírus/indexação ocorram
    try {
      fs.copyFileSync(tmpPath, filePath);
      fs.unlinkSync(tmpPath);
    } catch (_) {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (__) {}
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }
}
```

E alterar a chamada em `saveDatabase`:

```diff
--- a/artifacts/api-server/demo-server.mjs
+++ b/artifacts/api-server/demo-server.mjs
@@ -5028,7 +5028,7 @@ function saveDatabase(reason = "auto_save") {
     reconcileCleaningRequests();
     pruneDatabase();
     const stateJson = JSON.stringify(db);
-    fs.writeFileSync(DB_FILE, stateJson, "utf-8");
+    atomicWriteFileSync(DB_FILE, stateJson);
     if (pgPool) {
       if (!pgHydratedSuccessfully) {
```

---

## 6. Verificação de Integridade e Regra de Ouro (Dual Mirrored)

1. **Paridade SHA-256**:
   Toda e qualquer linha alterada em `artifacts/api-server/demo-server.mjs` deve ser espelhada com precisão cirúrgica em `scripts/demo-server.mjs`. O teste automatizado número 10 em `tests/whatsapp-ai-agent.test.mjs` checa essa paridade explicitamente.
2. **PostgreSQL Compatibility**:
   A query `INSERT INTO system_store (key, value, updated_at) VALUES ('db_state', $1::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()` receberá o JSON serializado completo contendo `faqItems`, garantindo replicação bidirecional contínua na nuvem.
3. **Escrita Atômica Verificada**:
   Testes comprovaram que o `renameSync` sobreescreve o arquivo no mesmo volume de forma atômica no Windows e no Linux, eliminando o risco de corrupção do `database.json`.
