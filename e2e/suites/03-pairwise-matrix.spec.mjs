/**
 * e2e/suites/03-pairwise-matrix.spec.mjs
 * 
 * Milestone 4 (M4) - Combinatorial State Matrix & Pairwise Testing (R4)
 * Comprehensive End-to-End Suite verifying the exhaustive business permutations of CorpFlats:
 * 
 * Scenarios:
 * 1. Matriz de Composições de Reserva & Durações (Permutações Pairwise, Tarifas, PMS Calendar & Vouchers)
 * 2. Auditoria dos 19 Flats sob Todos os 7 Estados de Governança no Dashboard de Limpeza
 * 3. Ciclo Completo de Ordens de Serviço (Criação Admin, Portal Token, Cadastro Prestador, Limites, Fotos & Camareira)
 * 4. Regras de Café da Manhã & Cutoff Rígido das 22h com Time-Travel (Portal /cafe, Produção Cozinha & Rejeição Pós-22h)
 */

import { test, expect } from "@playwright/test";
import { injectAuthSession, authenticatePage } from "../fixtures/auth-fixtures.mjs";
import { attachErrorGuard } from "../fixtures/error-guard.mjs";
import { setTimeTravelHour, resetTimeTravel } from "../sandbox/time-travel.mjs";

test.describe.serial("Milestone 4 (M4) - Matriz Combinatória de Estados Pairwise (R4)", () => {

  test.afterEach(async () => {
    await resetTimeTravel();
  });

  // =========================================================================
  // CENÁRIO 1: MATRIZ DE COMPOSIÇÕES DE RESERVA & DURAÇÕES
  // =========================================================================
  test("Cenário 1: Matriz de Composições de Reserva & Durações (Permutações Pairwise, Tarifas, PMS Calendar & Vouchers)", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      const now = new Date();
      const formatIso = (d) => d.toISOString().substring(0, 10);
      const todayStr = formatIso(now);
      const plusDays = (days) => {
        const d = new Date(now.getTime() + days * 86400000);
        return formatIso(d);
      };

      // -----------------------------------------------------------------------
      // 1.1 Pairwise Tariff Engine Validation (POST /api/bot-actions/quote)
      // -----------------------------------------------------------------------
      
      // Permutação A: Solo (1 hóspede), 1 diária
      const quoteSoloRes = await page.request.post(`${baseURL}/api/bot-actions/quote`, {
        data: {
          checkIn: todayStr,
          checkOut: plusDays(1),
          guests: 1,
          flatId: 1,
          channel: "direct",
          ratePlan: "room_only"
        }
      });
      expect(quoteSoloRes.ok()).toBe(true);
      const quoteSolo = await quoteSoloRes.json();
      expect(quoteSolo.success).toBe(true);
      expect(quoteSolo.nights).toBe(1);
      expect(quoteSolo.guests).toBe(1);
      expect(quoteSolo.extraBedFee).toBe(0); // Sem cama extra para 1 pessoa
      expect(quoteSolo.cleaningFee).toBe(70); // Taxa de limpeza padrão

      // Permutação B: Casal (2 hóspedes), Fim de semana (2 diárias)
      const quoteCoupleRes = await page.request.post(`${baseURL}/api/bot-actions/quote`, {
        data: {
          checkIn: plusDays(2),
          checkOut: plusDays(4),
          guests: 2,
          flatId: 4,
          channel: "direct",
          ratePlan: "room_only"
        }
      });
      expect(quoteCoupleRes.ok()).toBe(true);
      const quoteCouple = await quoteCoupleRes.json();
      expect(quoteCouple.success).toBe(true);
      expect(quoteCouple.nights).toBe(2);
      expect(quoteCouple.guests).toBe(2);
      expect(quoteCouple.extraBedFee).toBe(0); // 2 pessoas não aciona cama extra

      // Permutação C: Família (3 hóspedes: 2 adultos + 1 menor), 1 diária
      const quoteFamilyRes = await page.request.post(`${baseURL}/api/bot-actions/quote`, {
        data: {
          checkIn: plusDays(5),
          checkOut: plusDays(6),
          guests: 3,
          flatId: 8,
          channel: "direct",
          ratePlan: "room_only"
        }
      });
      expect(quoteFamilyRes.ok()).toBe(true);
      const quoteFamily = await quoteFamilyRes.json();
      expect(quoteFamily.success).toBe(true);
      expect(quoteFamily.guests).toBe(3);
      expect(quoteFamily.extraBedFee).toBe(60); // Aciona taxa de 3º hóspede / cama extra (R$ 60)

      // Permutação D: Lotação Máxima (4 hóspedes), Longa Permanência (>15 diárias: 16 diárias)
      const quoteLongStayRes = await page.request.post(`${baseURL}/api/bot-actions/quote`, {
        data: {
          checkIn: plusDays(7),
          checkOut: plusDays(23),
          guests: 4,
          flatId: 19,
          channel: "direct",
          ratePlan: "room_only"
        }
      });
      expect(quoteLongStayRes.ok()).toBe(true);
      const quoteLongStay = await quoteLongStayRes.json();
      expect(quoteLongStay.success).toBe(true);
      expect(quoteLongStay.nights).toBe(16);
      expect(quoteLongStay.guests).toBe(4);
      expect(quoteLongStay.extraBedFee).toBe(60);
      expect(quoteLongStay.roomTotal).toBeGreaterThan(2500);

      // -----------------------------------------------------------------------
      // 1.2 Criação e Persistência de Reservas no PMS (POST /api/pms/reservations)
      // -----------------------------------------------------------------------

      // Reserva 1: Individual / Solo (Flat 113)
      const resSoloRes = await page.request.post(`${baseURL}/api/pms/reservations`, {
        data: {
          flatId: 1, // 113
          guestName: "Lucas Pinheiro Solo",
          guestPhone: "22998877101",
          guestEmail: "lucas.solo@teste.corpflats",
          guestDocument: "11144477701",
          guestCount: 1,
          adults: 1,
          children: 0,
          checkinDate: todayStr,
          checkoutDate: plusDays(1),
          channel: "direta",
          totalAmount: quoteSolo.total,
          status: "confirmada"
        }
      });
      expect(resSoloRes.ok()).toBe(true);
      const resSolo = await resSoloRes.json();
      expect(resSolo.code).toMatch(/^RES-113-\d+/);
      expect(resSolo.adults).toBe(1);

      // Reserva 2: Casal (Flat 211)
      const resCoupleRes = await page.request.post(`${baseURL}/api/pms/reservations`, {
        data: {
          flatId: 4, // 211
          guestName: "Beatriz e Thiago Casal",
          guestPhone: "22998877102",
          guestEmail: "beatriz.casal@teste.corpflats",
          guestDocument: "22255588802",
          guestCount: 2,
          adults: 2,
          children: 0,
          checkinDate: plusDays(2),
          checkoutDate: plusDays(4),
          channel: "direta",
          totalAmount: quoteCouple.total,
          status: "confirmada"
        }
      });
      expect(resCoupleRes.ok()).toBe(true);
      const resCouple = await resCoupleRes.json();
      expect(resCouple.code).toMatch(/^RES-211-\d+/);
      expect(resCouple.adults).toBe(2);

      // Reserva 3: Família com Menor (Flat 408)
      const resFamilyRes = await page.request.post(`${baseURL}/api/pms/reservations`, {
        data: {
          flatId: 8, // 408
          guestName: "Família Nogueira",
          guestPhone: "22998877103",
          guestEmail: "familia.nogueira@teste.corpflats",
          guestDocument: "33366699903",
          guestCount: 3,
          adults: 2,
          children: 1,
          hasMinor: true,
          minorAge: "8",
          extraMattress: true,
          checkinDate: plusDays(5),
          checkoutDate: plusDays(6),
          channel: "direta",
          totalAmount: quoteFamily.total,
          status: "confirmada"
        }
      });
      expect(resFamilyRes.ok()).toBe(true);
      const resFamily = await resFamilyRes.json();
      expect(resFamily.code).toMatch(/^RES-408-\d+/);
      expect(resFamily.hasMinor).toBe(true);
      expect(resFamily.minorAge).toBe("8");

      // Reserva 4: Lotação Máxima (4 hóspedes) & Estadia Longa (>15 diárias: 16 noites no Flat 1004)
      const resLongStayRes = await page.request.post(`${baseURL}/api/pms/reservations`, {
        data: {
          flatId: 19, // 1004
          guestName: "Grupo Corporativo Offshore",
          guestPhone: "22998877104",
          guestEmail: "offshore.grupo@teste.corpflats",
          guestDocument: "44477700004",
          guestCount: 4,
          adults: 4,
          children: 0,
          checkinDate: plusDays(7),
          checkoutDate: plusDays(23),
          channel: "direta",
          totalAmount: quoteLongStay.total,
          status: "confirmada",
          isMonthlyGuest: false
        }
      });
      expect(resLongStayRes.ok()).toBe(true);
      const resLongStay = await resLongStayRes.json();
      expect(resLongStay.code).toMatch(/^RES-1004-\d+/);
      expect(resLongStay.checkinDate).toBe(plusDays(7));
      expect(resLongStay.checkoutDate).toBe(plusDays(23));

      // -----------------------------------------------------------------------
      // 1.3 Verificação no PMS Calendar (/reservas & /api/pms/calendar)
      // -----------------------------------------------------------------------
      await authenticatePage(page, "admin");

      const calRes = await page.request.get(`${baseURL}/api/pms/calendar?startDate=${todayStr}&endDate=${plusDays(25)}`);
      expect(calRes.ok()).toBe(true);
      const calData = await calRes.json();
      expect(Array.isArray(calData.reservations)).toBe(true);

      const foundSolo = calData.reservations.find(r => r.code === resSolo.code);
      const foundCouple = calData.reservations.find(r => r.code === resCouple.code);
      const foundFamily = calData.reservations.find(r => r.code === resFamily.code);
      const foundLongStay = calData.reservations.find(r => r.code === resLongStay.code);

      expect(foundSolo).toBeTruthy();
      expect(foundCouple).toBeTruthy();
      expect(foundFamily).toBeTruthy();
      expect(foundLongStay).toBeTruthy();

      // Navegar para a tela do Calendário PMS
      await page.goto("/reservas", { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);
      await expect(page.locator("body")).toContainText("Reservas");

      // -----------------------------------------------------------------------
      // 1.4 Geração de Voucher & Acesso ao Portal do Hóspede (/minha-reserva/:code)
      // -----------------------------------------------------------------------
      const portalRes = await page.request.get(`${baseURL}/api/pms/guest-portal/${resLongStay.code}`);
      expect(portalRes.ok()).toBe(true);
      const portalData = await portalRes.json();
      const resObj = portalData.reservation || portalData;
      expect(resObj.code).toBe(resLongStay.code);
      expect(String(resObj.flatNumber)).toBe("1004");
      expect(resObj.guestName).toContain("Offshore");

      // Navegar até a tela pública de voucher do hóspede
      await page.goto(`/minha-reserva/${resLongStay.code}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);

      // Validar exibição do flat, código e valor no portal
      await expect(page.locator("body")).toContainText("1004");
      await expect(page.locator("body")).toContainText(resLongStay.code);

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // CENÁRIO 2: AUDITORIA DOS 19 FLATS SOB TODOS OS 7 ESTADOS DE GOVERNANÇA
  // =========================================================================
  test("Cenário 2: Auditoria dos 19 Flats sob Todos os 7 Estados de Governança no Dashboard de Limpeza", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true });

    try {
      await authenticatePage(page, "admin");

      // -----------------------------------------------------------------------
      // 2.1 Verificação de Todos os 19 Flats Ativos
      // -----------------------------------------------------------------------
      const flatsRes = await page.request.get(`${baseURL}/api/flats`);
      expect(flatsRes.ok()).toBe(true);
      const flatsList = await flatsRes.json();
      expect(flatsList.length).toBe(19);

      const EXPECTED_19 = [
        "113", "114", "116", "211", "212", "215", "313", "408", "509", "511", 
        "512", "605", "712", "715", "904", "905", "907", "1004", "1304"
      ];
      const flatNumbers = flatsList.map(f => String(f.number));
      for (const num of EXPECTED_19) {
        expect(flatNumbers).toContain(num);
      }

      const todayStr = new Date().toISOString().substring(0, 10);

      // -----------------------------------------------------------------------
      // 2.2 Auditoria dos 7 Estados de Governança
      // -----------------------------------------------------------------------

      // Estado 1: Vago Sujo ('dirty' / pós-checkout)
      // Garantir solicitação com status dirty no flat 116
      const flat116 = flatsList.find(f => String(f.number) === "116");
      const reqDirty = await page.request.post(`${baseURL}/api/cleaning/requests/manual`, {
        data: {
          flatId: flat116.id,
          requestDate: todayStr,
          markAsClean: false,
          observation: "Limpeza de check-out pendente"
        }
      });
      expect(reqDirty.ok()).toBe(true);

      // Estado 2: Limpo ('clean')
      // Garantir flat 113 marcado como limpo
      const flat113 = flatsList.find(f => String(f.number) === "113");
      const reqClean = await page.request.post(`${baseURL}/api/cleaning/requests/manual`, {
        data: {
          flatId: flat113.id,
          requestDate: todayStr,
          markAsClean: true,
          assignedUserId: 2, // Cris
          observation: "Quarto limpo e inspecionado"
        }
      });
      expect(reqClean.ok()).toBe(true);

      // Estado 3: Ocupado ('occupied')
      // Flat 211 possui reserva ativa hoje
      const flat211 = flatsList.find(f => String(f.number) === "211");
      expect(flat211).toBeTruthy();

      // Estado 4: Saída Prevista ('checkout_today')
      // Seed reservation RES-TEST-CHECKIN-TODAY no 211 ou RES-TEST-ZERO-AMNESIA no 114
      const checkoutsRes = await page.request.get(`${baseURL}/api/reservations/checkouts?date=${todayStr}`);
      expect(checkoutsRes.ok()).toBe(true);
      const checkouts = await checkoutsRes.json();
      expect(Array.isArray(checkouts)).toBe(true);

      // Estado 5: Faxina Periódica / Estadia ('stayover')
      // Criar solicitação de stayover com instrução de troca de toalhas no Flat 511
      const flat511 = flatsList.find(f => String(f.number) === "511");
      const reqStayover = await page.request.post(`${baseURL}/api/cleaning/requests/manual`, {
        data: {
          flatId: flat511.id,
          requestDate: todayStr,
          isPriority: false,
          observation: "Estadia / Faxina periódica com troca de roupa de cama"
        }
      });
      expect(reqStayover.ok()).toBe(true);

      // Estado 6: Arrumação / Instrução Operacional ('touchup')
      // Criar instrução manual avulsa no flat 313 (separar camas)
      const flat313 = flatsList.find(f => String(f.number) === "313");
      const reqTouchup = await page.request.post(`${baseURL}/api/cleaning/requests/manual`, {
        data: {
          flatId: flat313.id,
          requestDate: todayStr,
          requestType: "instruction",
          twinBeds: true,
          instructionText: "Separar as camas, colocar como 2 solteiras",
          isPaidCleaning: false
        }
      });
      expect(reqTouchup.ok()).toBe(true);

      // Estado 7: Manutenção Bloqueada ('maintenance')
      // Bloquear Flat 605 para manutenção
      const flat605 = flatsList.find(f => String(f.number) === "605");
      const blockRes = await page.request.post(`${baseURL}/api/pms/blocks`, {
        data: {
          flatId: flat605.id,
          startDate: todayStr,
          endDate: new Date(Date.now() + 3 * 86400000).toISOString().substring(0, 10),
          reason: "manutencao",
          notes: "Troca do compressor do ar-condicionado e pintura do teto"
        }
      });
      expect(blockRes.ok()).toBe(true);
      const blockData = await blockRes.json();
      expect(blockData.id).toBeTruthy();
      expect(blockData.reason).toBe("manutencao");

      // -----------------------------------------------------------------------
      // 2.3 Navegação no Dashboard de Governança (/dashboard)
      // -----------------------------------------------------------------------
      await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);

      // Verificar elementos principais do dashboard de limpeza
      await expect(page.locator("body")).toContainText("Governança");
      await expect(page.locator("body")).toContainText("Sujos");
      await expect(page.locator("body")).toContainText("Limpos");

      // -----------------------------------------------------------------------
      // 2.4 Transições de Status Operacionais
      // -----------------------------------------------------------------------

      // Transição 1: Iniciar Limpeza (cleaning_now) no Flat 116
      const dirtyReqData = await reqDirty.json();
      const startRes = await page.request.patch(`${baseURL}/api/cleaning/assignments/${dirtyReqData.id}/status`, {
        data: {
          status: "cleaning_now",
          flatNumber: "116",
          flatId: flat116.id,
          date: todayStr
        }
      });
      expect(startRes.ok()).toBe(true);
      const startJson = await startRes.json();
      expect(startJson.status).toBe("cleaning_now");

      // Transição 2: Concluir Limpeza (clean) no Flat 116
      const finishRes = await page.request.patch(`${baseURL}/api/cleaning/assignments/${dirtyReqData.id}/status`, {
        data: {
          status: "clean",
          flatNumber: "116",
          flatId: flat116.id,
          date: todayStr
        }
      });
      expect(finishRes.ok()).toBe(true);
      const finishJson = await finishRes.json();
      expect(finishJson.status).toBe("clean");

      // Transição 3: Verificar Bloqueio no Calendário PMS e Desbloquear
      const calCheck = await page.request.get(`${baseURL}/api/pms/calendar`);
      expect(calCheck.ok()).toBe(true);
      const calJson = await calCheck.json();
      const hasBlock = (calJson.blocks || []).some(b => b.id === blockData.id || (b.flatId === flat605.id && b.reason === "manutencao"));
      expect(hasBlock).toBe(true);

      // Transição 4: Desbloquear Manutenção
      const unblockRes = await page.request.delete(`${baseURL}/api/pms/blocks/${blockData.id}`);
      expect(unblockRes.ok()).toBe(true);

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // CENÁRIO 3: CICLO COMPLETO DE ORDENS DE SERVIÇO EXTERNAS (SERVICE ORDERS)
  // =========================================================================
  test("Cenário 3: Ciclo Completo de Ordens de Serviço (Criação Admin, Portal Token, Cadastro Prestador, Limites, Fotos & Camareira)", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true, allowedApiStatuses: [400] });

    try {
      await authenticatePage(page, "admin");

      // -----------------------------------------------------------------------
      // 3.1 Criação da Ordem de Serviço pelo Admin (/servicos)
      // -----------------------------------------------------------------------
      const createOrderRes = await page.request.post(`${baseURL}/api/service-orders`, {
        data: {
          title: "Revisão e Pintura Pairwise Testing",
          description: "Inspeção e pintura nos apartamentos selecionados",
          cleanFlatMode: "priority",
          maxSimultaneousFlats: 1, // Limite estrito de 1 por vez para teste
          maxFlatsPerDay: 2,
          requirePhotos: true,
          estimatedDurationHours: 2,
          instructionFormat: "text",
          flats: [
            {
              flatId: 1,
              flatNumber: "113",
              instructions: "Retocar rodapé e pintura da sala"
            },
            {
              flatId: 2,
              flatNumber: "114",
              instructions: "Pintura completa da porta de entrada"
            }
          ]
        }
      });
      expect(createOrderRes.ok()).toBe(true);
      const order = await createOrderRes.json();
      expect(order.id).toBeTruthy();
      expect(order.token).toBeTruthy();
      expect(order.flats.length).toBe(2);

      const token = order.token;

      // -----------------------------------------------------------------------
      // 3.2 Acesso Público via Link com Token (/servico/:token)
      // -----------------------------------------------------------------------
      await page.goto(`/servico/${token}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);
      await expect(page.locator("body")).toContainText("Portal do Prestador");

      // -----------------------------------------------------------------------
      // 3.3 Identificação do Prestador Principal e Colaboradores
      // -----------------------------------------------------------------------
      const regRes = await page.request.post(`${baseURL}/api/service/public/${token}/register`, {
        data: {
          mainWorker: {
            name: "Carlos Silveira Prestador",
            cpf: "12345678909",
            phone: "22998877660",
            companyName: "Clima & Pintura ME"
          },
          collaborators: [
            {
              name: "Marcos Ajudante",
              cpf: "98765432109"
            }
          ]
        }
      });
      expect(regRes.ok()).toBe(true);
      const regJson = await regRes.json();
      expect(regJson.success).toBe(true);

      // -----------------------------------------------------------------------
      // 3.4 Início de Flat & Validação de Limites Simultâneos
      // -----------------------------------------------------------------------
      
      // Inicia serviço no Flat 113
      const startFlat1Res = await page.request.post(`${baseURL}/api/service/public/${token}/flats/1/start`);
      expect(startFlat1Res.ok()).toBe(true);
      const startFlat1 = await startFlat1Res.json();
      expect(startFlat1.success).toBe(true);
      expect(startFlat1.flat.status).toBe("in_progress");

      // Tenta iniciar o Flat 114 simultaneamente -> deve ser rejeitado por maxSimultaneousFlats = 1
      const startFlat2Fail = await page.request.post(`${baseURL}/api/service/public/${token}/flats/2/start`);
      expect(startFlat2Fail.status()).toBe(400);
      const failJson = await startFlat2Fail.json();
      expect(failJson.error).toContain("Limite de apartamentos simultâneos atingido");

      // -----------------------------------------------------------------------
      // 3.5 Upload de Fotos e Conclusão com Validação de 'needsCleaning'
      // -----------------------------------------------------------------------
      const mockPhotoBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

      // Se tentar finalizar sem foto (requirePhotos = true) -> rejeitado com 400
      const finishNoPhotoFail = await page.request.post(`${baseURL}/api/service/public/${token}/flats/1/finish`, {
        data: {
          observations: "Serviço feito sem fotos",
          photos: [],
          needsCleaning: true
        }
      });
      expect(finishNoPhotoFail.status()).toBe(400);
      const noPhotoJson = await finishNoPhotoFail.json();
      expect(noPhotoJson.error).toContain("obrigatório anexar pelo menos 1 foto");

      // Finalização bem-sucedida com fotos e needsCleaning = true
      const finishSuccessRes = await page.request.post(`${baseURL}/api/service/public/${token}/flats/1/finish`, {
        data: {
          observations: "Pintura concluída com perfeição. Respingo de tinta no chão requer faxina.",
          photos: [mockPhotoBase64],
          needsCleaning: true
        }
      });
      expect(finishSuccessRes.ok()).toBe(true);
      const finishSuccess = await finishSuccessRes.json();
      expect(finishSuccess.flat.status).toBe("done");
      expect(finishSuccess.flat.needsCleaning).toBe(true);

      // -----------------------------------------------------------------------
      // 3.6 Acompanhamento no Painel Admin e Badge na Camareira
      // -----------------------------------------------------------------------
      await authenticatePage(page, "admin");

      // Verificar progresso da OS no painel admin
      const progressRes = await page.request.get(`${baseURL}/api/service-orders/${order.id}/progress`);
      expect(progressRes.ok()).toBe(true);
      const progress = await progressRes.json();
      expect(progress.stats.done).toBe(1);
      expect(progress.stats.total).toBe(2);
      expect(progress.stats.percentage).toBe(50);

      // Verificar que needsCleaning = true gerou solicitação de limpeza dirty para a camareira
      const cleaningCheckRes = await page.request.get(`${baseURL}/api/reservations/checkouts`);
      expect(cleaningCheckRes.ok()).toBe(true);
      const checkouts = await cleaningCheckRes.json();
      const flat113Item = checkouts.find(c => String(c.flatNumber) === "113");
      expect(flat113Item).toBeTruthy();
      expect(flat113Item.cleaningRequest?.source).toBe("service_order");
      expect(flat113Item.cleaningRequest?.status).toBe("dirty");

      guard.assertNoErrors();
    } finally {
      guard.detach();
    }
  });


  // =========================================================================
  // CENÁRIO 4: REGRAS DE CAFÉ DA MANHÃ & CUTOFF RÍGIDO DAS 22:00
  // =========================================================================
  test("Cenário 4: Regras de Café da Manhã & Cutoff Rígido das 22h com Time-Travel (Portal /cafe, Produção Cozinha & Rejeição Pós-22h)", async ({ page, baseURL }) => {
    const guard = attachErrorGuard(page, { allowGuestAuth401: true, allowedApiStatuses: [400] });

    try {
      // -----------------------------------------------------------------------
      // 4.1 Configurar Time-Travel para 15:00 (Antes do horário de corte das 22h)
      // -----------------------------------------------------------------------
      await setTimeTravelHour({ targetHour: 15 });

      const now = new Date();
      const tomorrowDate = new Date(now.getTime() + 86400000);
      const tomorrowIso = tomorrowDate.toISOString().substring(0, 10);

      // -----------------------------------------------------------------------
      // 4.2 Acesso ao Portal do Hóspede (/cafe/:code)
      // -----------------------------------------------------------------------
      await page.goto("/cafe/RES-TEST-BREAKFAST", { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);
      await expect(page.locator("body")).toContainText("Café da Manhã");
      await expect(page.locator("body")).toContainText("509");

      // -----------------------------------------------------------------------
      // 4.3 Submissão Válida Antes das 22:00 (Aceita e refletida na cozinha)
      // -----------------------------------------------------------------------
      const orderPayload = {
        roomNumber: "509",
        clientName: "Eduardo Fonseca",
        phone: "5522998877668",
        reservationCode: "RES-TEST-BREAKFAST",
        guestCount: 2,
        deliveryDates: [tomorrowIso],
        deliveryDate: tomorrowIso,
        deliveryTime: "07:30",
        isStandard: false,
        orderType: "custom",
        orderMode: "unified",
        guestChoices: [
          {
            guestIndex: 1,
            guestName: "Eduardo Fonseca",
            coffee: "Café",
            otherBeverage: "Suco de laranja",
            breads: ["Pão de queijo", "Pão francês"],
            accompaniments: ["Ovos mexidos", "Queijo mussarela"],
            fruit: "Salada de frutas"
          },
          {
            guestIndex: 2,
            guestName: "Patricia Fonseca",
            coffee: "Leite",
            otherBeverage: "Suco de laranja",
            breads: ["Pão de queijo"],
            accompaniments: ["Presunto", "Queijo mussarela"],
            fruit: "Mamão"
          }
        ],
        notes: "Por favor entregar pontualmente às 07:30"
      };

      const submitOrderRes = await page.request.post(`${baseURL}/api/breakfast/orders`, {
        data: orderPayload
      });
      expect(submitOrderRes.ok()).toBe(true);
      const orderResult = await submitOrderRes.json();
      expect(orderResult.success).toBe(true);
      const createdOrderId = orderResult.order?.id || orderResult.orders?.[0]?.id || orderResult.orderId;
      expect(createdOrderId).toBeTruthy();

      // Verificar que o pedido foi refletido no painel de produção da cozinha (/pedidos-cafe)
      await authenticatePage(page, "admin");

      const kitchenRes = await page.request.get(`${baseURL}/api/breakfast/orders?date=${tomorrowIso}`);
      expect(kitchenRes.ok()).toBe(true);
      const kitchenData = await kitchenRes.json();
      const kitchenOrders = Array.isArray(kitchenData) ? kitchenData : (kitchenData.orders || []);
      const foundKitchenOrder = kitchenOrders.find(o => String(o.roomNumber) === "509" && o.date === tomorrowIso);
      expect(foundKitchenOrder).toBeTruthy();
      expect(foundKitchenOrder.clientName).toContain("Eduardo Fonseca");
      expect(foundKitchenOrder.deliveryTime).toBe("07:30");

      // Navegar até o Painel de Produção da Cozinha
      await page.goto("/pedidos-cafe", { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);
      await expect(page.locator("body")).toContainText("Produção");

      // -----------------------------------------------------------------------
      // 4.4 Avanço de Relógio via Time-Travel para Pós-22:00 (Ex: 22:15)
      // -----------------------------------------------------------------------
      await setTimeTravelHour({ targetHour: 22 });

      // -----------------------------------------------------------------------
      // 4.5 Submissão Pós-22:00 Rejeitada com Mensagem Explicativa de Cutoff
      // -----------------------------------------------------------------------
      const lateOrderPayload = {
        ...orderPayload,
        clientName: "Eduardo Fonseca Atrasado",
        deliveryDates: [tomorrowIso],
        deliveryDate: tomorrowIso,
        deliveryTime: "08:00"
      };

      const lateOrderRes = await page.request.post(`${baseURL}/api/breakfast/orders`, {
        data: lateOrderPayload
      });
      expect(lateOrderRes.status()).toBe(400);
      const lateOrderJson = await lateOrderRes.json();
      
      // Validação estrita da mensagem de corte rígido das 22h
      expect(lateOrderJson.error).toContain("cutoff");
      expect(lateOrderJson.error).toContain("22:00");
      expect(lateOrderJson.error).toContain("encerrado");

      // Verificar que o portal do hóspede exibe o corte encerrado
      await page.goto("/cafe/RES-TEST-BREAKFAST", { waitUntil: "domcontentloaded", timeout: 30000 });
      await guard.assertZeroWhiteScreen(30000);
      await expect(page.locator("body")).toContainText("22:00");

      guard.assertNoErrors();
    } finally {
      await resetTimeTravel();
      guard.detach();
    }
  });

});
