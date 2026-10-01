import https from "https";

const adminToken = Buffer.from(JSON.stringify({ v: 2, id: 1 })).toString("base64");
const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${adminToken}`
};

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (dataString) {
      reqHeaders["Content-Length"] = Buffer.byteLength(dataString);
    }
    const req = https.request({
      hostname: "corpflats.onrender.com",
      path,
      method,
      headers: reqHeaders,
      timeout: 20000
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout calling " + path));
    });
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function run() {
  console.log("=== EXECUTANDO REPARO EM PRODUÇÃO (Render PostgreSQL) ===");

  // 1. Mover Costa Frederico (id: 306) no Flat 712 para 01/10 a 02/10
  console.log("1. Atualizando Costa Frederico (Flat 712 -> 01/10 a 02/10)...");
  try {
    const res306 = await apiRequest("PUT", "/api/pms/reservations/306", {
      checkinDate: "2026-10-01",
      checkoutDate: "2026-10-02",
      status: "confirmada"
    });
    console.log("   Resultado Frederico:", res306.status, res306.data?.id || res306.data?.error || res306.text?.slice(0, 100));
  } catch (e) {
    console.error("   Erro Frederico:", e.message);
  }

  // 2. Restaurar Adriana Alves da Silva (id: 318) no Flat 712 (30/09 a 01/10)
  console.log("2. Restaurando Adriana Alves da Silva (Flat 712 -> 30/09 a 01/10)...");
  try {
    const adrianaPayload = {
      id: 318,
      code: "RES-712-0318",
      flatId: 14,
      flatNumber: "712",
      guestId: 165,
      guestName: "Adriana Alves da Silva",
      guestDocument: "06955536745",
      guestPhone: "21981090085",
      guestCount: 1,
      guests: [
        {
          cpf: "06955536745",
          name: "Adriana Alves da Silva",
          email: "",
          index: 1,
          phone: "21981090085",
          checkinCompletedAt: null,
          hasCompletedCheckin: false
        }
      ],
      checkinDate: "2026-09-30",
      checkinTime: "14:00",
      checkoutDate: "2026-10-01",
      checkoutTime: "12:00",
      dailyRate: 230,
      totalAmount: 230,
      paidAmount: 230,
      paymentMethod: "pix",
      paymentStatus: "pago_total",
      channel: "whatsapp",
      clientType: "avulso",
      isMonthlyGuest: false,
      includeBreakfast: false,
      status: "confirmada"
    };
    const res318 = await apiRequest("POST", "/api/pms/reservations", adrianaPayload);
    console.log("   Resultado Adriana:", res318.status, res318.data?.id || res318.data?.code || res318.data?.error || res318.text?.slice(0, 100));
  } catch (e) {
    console.error("   Erro Adriana:", e.message);
  }

  // 3. Ajustar Felipe (id: 179) no Flat 605 para saída em 28/09
  console.log("3. Ajustando saída do Felipe (Flat 605 -> 28/09)...");
  try {
    const res179 = await apiRequest("PUT", "/api/pms/reservations/179", {
      checkoutDate: "2026-09-28",
      status: "confirmada"
    });
    console.log("   Resultado Felipe:", res179.status, res179.data?.id || res179.data?.error || res179.text?.slice(0, 100));
  } catch (e) {
    console.error("   Erro Felipe:", e.message);
  }

  // 4. Estender Angelo (id: 305) no Flat 1304 para checkout em 01/10
  console.log("4. Estendendo checkout do Angelo (Flat 1304 -> 01/10)...");
  try {
    const res305 = await apiRequest("PUT", "/api/pms/reservations/305", {
      checkoutDate: "2026-10-01",
      totalAmount: 500,
      paidAmount: 500,
      status: "confirmada"
    });
    console.log("   Resultado Angelo:", res305.status, res305.data?.id || res305.data?.error || res305.text?.slice(0, 100));
  } catch (e) {
    console.error("   Erro Angelo:", e.message);
  }

  // 5. Restaurar Heverton Martins (id: 36) no Flat 509 para checkout em 09/10
  console.log("5. Restaurando Heverton Martins (Flat 509 -> 09/10)...");
  try {
    const res36 = await apiRequest("PUT", "/api/pms/reservations/36", {
      checkoutDate: "2026-10-09",
      isMonthlyGuest: true,
      clientType: "mensalista",
      status: "confirmada"
    });
    console.log("   Resultado Heverton:", res36.status, res36.data?.id || res36.data?.error || res36.text?.slice(0, 100));
  } catch (e) {
    console.error("   Erro Heverton:", e.message);
  }

  // 6. Deletar/Cancelar reserva zumbi de Miller (id: 302) no Flat 509
  console.log("6. Removendo reserva zumbi de Miller no Flat 509 (id: 302)...");
  try {
    const res302 = await apiRequest("DELETE", "/api/pms/reservations/302");
    console.log("   Resultado Delete Miller:", res302.status, res302.data || res302.text?.slice(0, 100));
  } catch (e) {
    console.error("   Erro Delete Miller:", e.message);
  }

  // 7. Verificação do calendário de produção
  console.log("\n=== CONSULTANDO CALENDÁRIO ATUALIZADO EM PRODUÇÃO ===");
  try {
    const calRes = await apiRequest("GET", "/api/pms/calendar?startDate=2026-09-28&endDate=2026-10-05");
    const reservations = calRes.data?.reservations || [];
    const targets = ["509", "605", "712", "1304", "211"];
    const filtered = reservations.filter(r => targets.includes(String(r.flatNumber)));
    console.log(`Total de reservas encontradas nos flats impactados: ${filtered.length}`);
    filtered.forEach(r => {
      console.log(`Flat ${String(r.flatNumber).padEnd(5)} | ${String(r.code || r.id).padEnd(14)} | ${(r.guestName || "").padEnd(35)} | ${r.checkinDate} -> ${r.checkoutDate} | ${r.status}`);
    });
  } catch (e) {
    console.error("Erro ao consultar calendário final:", e.message);
  }
}

run();
