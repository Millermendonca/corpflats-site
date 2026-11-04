# Task Assignment: Survey Explorer 2 (CRM 360° Models & Fiscal Invoices UI)
Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2
Role: teamwork_preview_explorer

Focus:
1. Audit and map CRM data structures and endpoints for Companies (`db.companies`, `/api/companies`) and Guests (`db.guests`, `/api/guests`), as well as reservations (`db.reservations`).
2. Inspect `artifacts/limpeza/src/pages/crm-guests.tsx` and company modal/guest modal: check what fields exist, what fields are missing for full fiscal/address compliance (CNPJ, Razão Social, Nome Fantasia, IE/IM, CEP, Logradouro, Número, Bairro, Cidade, UF, Código IBGE, E-mail Financeiro, Telefone, Contato, companyId, autoEmitInvoice).
3. Inspect `artifacts/limpeza/src/pages/fiscal-invoices.tsx` (and related components): check current CRM search/selector, prefilling logic, how Tomador is populated, and how to implement quick toggle between Linked Company (PJ) and Guest (PF).
4. Verify how parameters from URL or reservation link (flat, check-in, check-out, diárias, valor) are passed into the invoice form.
5. Write your comprehensive report in `handoff.md` within your working directory.

## 2026-10-14T09:41:47Z
Você é o Survey Explorer 2 (CRM 360° Models & Fiscal Invoices UI).
Seu diretório de trabalho: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2
Leia atentamente:
1. O arquivo oficial de requisitos: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
2. Sua atribuição de tarefa: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\DISPATCH.md

Seus objetivos de investigação:
1. Investigar a modelagem e endpoints do CRM no backend: `db.companies`, `/api/companies`, `db.guests`, `/api/guests`, `db.reservations`, `/api/pms/reservations`.
2. Investigar a UI do CRM em `artifacts/limpeza/src/pages/crm-guests.tsx` e modais associados: verificar quais campos fiscais e de endereço existem e quais faltam para Empresas (CNPJ, Razão Social, Nome Fantasia, IE, IM, CEP, Logradouro/Endereço, Número, Bairro, Cidade, UF, Código IBGE, E-mail Financeiro, Telefone, Contato) e Hóspedes (CPF/CNPJ, Nome Completo, CEP, Endereço, Número, Bairro, Cidade, UF, E-mail, Telefone, `companyId`, `autoEmitInvoice`).
3. Investigar a UI de Notas Fiscais em `artifacts/limpeza/src/pages/fiscal-invoices.tsx` (e componentes associados): verificar como funciona o seletor atual do CRM, como busca reservas/hóspedes, como preenche o Tomador, como implementar a busca tanto de Hóspedes quanto de Empresas, e a alternância rápida de Tomador entre a Empresa Vinculada (PJ) e o Hóspede (PF).
4. Mapear a passagem de parâmetros via URL/rotas para a tela de notas fiscais (ex.: flat, datas, valor, hóspede).

Crie seu `progress.md` com status e entregue seu relatório detalhado com evidências e caminhos de arquivo em `handoff.md` no seu diretório de trabalho. Ao concluir, avise o orquestrador via `send_message`.

## 2026-11-04T16:04:50Z
You are Explorer 2 (Backend Engine Explorer).
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\
Read ORIGINAL_REQUEST.md at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture and rules in c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md.

YOUR GOAL:
Investigate and produce a complete technical analysis for Requirements R2, R3, R4 (Backend Trigger, Eligibility, FairShare, Hold, Silent Expire, Webhook PIX, PMS & Cleaning Update):
1. In `artifacts/api-server/demo-server.mjs` and related modules (`inter-pix-service.mjs`, `maid-automation-service.mjs`, `wbp/`, etc.):
   - How are scheduled background automations triggered (e.g. cron or interval checks, specifically Saturdays at 19:00h)?
   - How are reservations filtered: identifying active/in_stay or confirmed reservations with original checkout on the upcoming Sunday at 12:00h?
   - How is Sunday-to-Monday availability verified:
     a. Flat vago de domingo para segunda.
     b. Flat com check-in agendado no domingo: how `selectFairShareFlat` works in the codebase, how reallocating the incoming guest to an alternate flat works, and building occupancy check (100% full check).
   - How to create the 30-minute hold: how temporary holds/pre-reservas are modeled in `db` / system store, how expiration is tracked, and how silent expiration (`isSilentUpsellHold: true`) is implemented so that when 30 minutes expire without payment, the hold is removed in silence WITHOUT sending any cancellation/expiration message to the guest, preserving the original Sunday 12:00h checkout.
   - How PIX charges are generated: `createInterPixCob` / `generateStaticPixPayload` for the promotional price (`sundayUpsellPrice`).
   - Webhook PIX processing: when the webhook receives payment confirmation for this upsell:
     a. How to identify this specific upsell transaction.
     b. How to extend the reservation checkout to Monday 12:00h in PMS.
     c. How to reschedule maid cleaning for the flat from Sunday to Monday.
     d. How to execute the reallocation of any incoming guest to the alternative flat selected via `selectFairShareFlat`.
     e. How the confirmation message is sent: "Pagamento confirmado! 🎉 Seu check-out livre de domingo (com direito a ficar até segunda às 12h se desejar) já está garantido no sistema. Aproveite seu descanso!".
2. Notice the twin-server rule: `artifacts/api-server/` <-> `scripts/`. Note that workers must edit `artifacts/api-server/` and mirror to `scripts/`.
3. Provide exact code locations, function signatures, data structures, and step-by-step implementation plan.

DELIVERABLES:
Write your full findings to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\analysis.md`
Write your completion handoff report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_2\handoff.md`
Notify me via send_message when complete.
