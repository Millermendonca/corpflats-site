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
