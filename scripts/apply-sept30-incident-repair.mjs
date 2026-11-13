import fs from "fs";
import path from "path";
import https from "https";

const dbPath = path.resolve("data/database.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

console.log("=== EXECUTANDO REPARO DO INCIDENTE DE 30/09 ===");

// 1. Adriana Alves da Silva (Flat 712, 30/09 a 01/10) - Audit log #3148
let adriana = db.reservations.find(r => r.id === 318 || r.code === "RES-712-0318");
if (!adriana) {
  adriana = {
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
    status: "confirmada",
    createdAt: "2026-09-30T18:38:37.265Z",
    updatedAt: "2026-09-30T18:38:37.265Z"
  };
  db.reservations.push(adriana);
  console.log("-> Adriana Alves da Silva restaurada no Flat 712 (30/09 a 01/10).");
} else {
  adriana.checkinDate = "2026-09-30";
  adriana.checkoutDate = "2026-10-01";
  adriana.guestName = "Adriana Alves da Silva";
  adriana.status = "confirmada";
  console.log("-> Adriana Alves da Silva atualizada no Flat 712.");
}

// Garante Adriana em db.guests
if (!Array.isArray(db.guests)) db.guests = [];
const guestAdriana = db.guests.find(g => g.id === 165 || (g.document && g.document.replace(/\D/g, '') === '06955536745'));
if (!guestAdriana) {
  db.guests.push({
    id: 165,
    guestCode: "HOSP-00165",
    name: "Adriana Alves da Silva",
    document: "06955536745",
    phone: "21981090085",
    clientType: "avulso",
    createdAt: "2026-09-30T18:38:37.265Z"
  });
}

// 2. Costa Frederico (Flat 712, 01/10 a 02/10)
const frederico = db.reservations.find(r => r.id === 306 || r.code === "RES-712-0306" || (String(r.flatNumber) === "712" && r.guestName && r.guestName.toLowerCase().includes("frederico")));
if (frederico) {
  frederico.checkinDate = "2026-10-01";
  frederico.checkoutDate = "2026-10-02";
  frederico.status = "confirmada";
  frederico.updatedAt = new Date().toISOString();
  console.log("-> Costa Frederico movido para 01/10 a 02/10 no Flat 712.");
}

// 3. Felipe (Flat 605, checkout 28/09)
const felipe = db.reservations.find(r => r.id === 179 || r.code === "RES-605-0179" || (String(r.flatNumber) === "605" && r.guestName && r.guestName.toLowerCase().includes("felipe")));
if (felipe) {
  felipe.checkoutDate = "2026-09-28";
  felipe.status = "confirmada";
  felipe.updatedAt = new Date().toISOString();
  console.log("-> Felipe saída ajustada para 28/09 no Flat 605.");
}

// 4. Gil / Gilberto (Flat 605, 30/09 a 01/10) - Audit log #3181
let gil = db.reservations.find(r => r.id === 320 || r.code === "RES-605-0320" || (String(r.flatNumber) === "605" && r.guestName && (r.guestName.toLowerCase().includes("gil") || r.guestName.toLowerCase().includes("gilberto"))));
if (!gil) {
  gil = {
    id: 320,
    code: "RES-605-0320",
    flatId: 13,
    flatNumber: "605",
    guestId: 167,
    guestName: "Gilberto",
    guestPhone: "27998221965",
    guestCount: 2,
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
    status: "confirmada",
    createdAt: "2026-09-30T18:43:30.164Z",
    updatedAt: "2026-09-30T18:43:30.164Z"
  };
  db.reservations.push(gil);
  console.log("-> Gilberto restaurado no Flat 605 (30/09 a 01/10).");
} else {
  gil.checkinDate = "2026-09-30";
  gil.checkoutDate = "2026-10-01";
  gil.status = "confirmada";
  console.log("-> Gilberto confirmado no Flat 605 (30/09 a 01/10).");
}

// 5. Isabela Barbosa (Flat 211, 30/09 a 01/10) - Audit log #3149
let isabela = db.reservations.find(r => r.id === 319 || r.code === "RES-211-0319");
if (!isabela) {
  isabela = {
    id: 319,
    code: "RES-211-0319",
    flatId: 4,
    flatNumber: "211",
    guestId: 166,
    guestName: "Isabela Barbosa dos Santos Ribeiro",
    guestDocument: "14807628739",
    guestCount: 1,
    guests: [
      {
        cpf: "14807628739",
        name: "Isabela Barbosa dos Santos Ribeiro",
        email: "",
        index: 1,
        phone: "",
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
    status: "confirmada",
    createdAt: "2026-09-30T18:40:30.886Z",
    updatedAt: "2026-09-30T18:40:30.886Z"
  };
  db.reservations.push(isabela);
  console.log("-> Isabela Barbosa garantida no Flat 211 (30/09 a 01/10).");
} else {
  isabela.checkinDate = "2026-09-30";
  isabela.checkoutDate = "2026-10-01";
  isabela.status = "confirmada";
  console.log("-> Isabela Barbosa confirmada no Flat 211.");
}

// 6. Angelo (Flat 1304, checkout em 01/10) - Audit log #3115
const angelo = db.reservations.find(r => r.id === 305 || r.code === "RES-1304-0305" || (String(r.flatNumber) === "1304" && r.guestName && r.guestName.toLowerCase().includes("angelo")));
if (angelo) {
  angelo.checkoutDate = "2026-10-01";
  angelo.totalAmount = 500;
  angelo.paidAmount = 500;
  angelo.updatedAt = new Date().toISOString();
  console.log("-> Angelo checkout estendido para 01/10 no Flat 1304.");
}

// 7. Heverton Martins (Flat 509, checkout em 09/10) - Audit log #2633
const heverton = db.reservations.find(r => r.id === 36 || r.code === "RES-509-0036" || (String(r.flatNumber) === "509" && r.guestName && r.guestName.toLowerCase().includes("heverton")));
if (heverton) {
  heverton.checkinDate = "2026-09-04";
  heverton.checkoutDate = "2026-10-09";
  heverton.status = "confirmada";
  heverton.isMonthlyGuest = true;
  heverton.clientType = "mensalista";
  heverton.updatedAt = new Date().toISOString();
  console.log("-> Heverton Martins checkout restaurado para 09/10 no Flat 509.");
}

// 8. Remoção da reserva zumbi de Miller no Flat 509 (id 302 / RES-509-0302)
const beforeCount = db.reservations.length;
db.reservations = db.reservations.filter(r => {
  if (String(r.flatNumber) === "509" && (r.id === 302 || r.code === "RES-509-0302" || (r.guestName && r.guestName.toLowerCase().includes("miller")))) {
    console.log("-> Removendo reserva zumbi de Miller no Flat 509 (ID:", r.id, r.code, ")");
    return false;
  }
  return true;
});
console.log(`-> Reservas zumbi removidas: ${beforeCount - db.reservations.length}`);

// Limpeza de governança do Flat 509 vinculada à reserva zumbi
if (Array.isArray(db.cleaningRequests)) {
  const origCleanCount = db.cleaningRequests.length;
  db.cleaningRequests = db.cleaningRequests.filter(c => {
    if (String(c.flatNumber) === "509" && c.requestDate === "2026-09-30" && c.leavingGuest && c.leavingGuest.toLowerCase().includes("miller")) {
      return false;
    }
    return true;
  });
  console.log(`-> Limpezas zumbi removidas: ${origCleanCount - db.cleaningRequests.length}`);

  db.cleaningRequests.forEach(c => {
    if (String(c.flatNumber) === "509" && c.requestDate === "2026-09-29") {
      if (c.arrivingGuest && c.arrivingGuest.toLowerCase().includes("miller")) {
        c.arrivingGuest = null;
      }
    }
  });
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
console.log("data/database.json salvo com sucesso!");

// Verificação do status final das reservas
console.log("\n=== STATUS DAS RESERVAS IMPACTADAS EM data/database.json ===");
const targets = ["509", "605", "712", "1304", "211"];
const verified = db.reservations.filter(r => targets.includes(String(r.flatNumber)) && (r.checkoutDate >= "2026-09-28" && r.checkinDate <= "2026-10-05"));
verified.forEach(r => console.log(`Flat ${r.flatNumber.padEnd(5)} | ${r.code.padEnd(14)} | ${(r.guestName || "").padEnd(35)} | ${r.checkinDate} -> ${r.checkoutDate} | ${r.status}`));
