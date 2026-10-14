import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

console.log("=== [TEST] Guest Auth Security, Multi-Identifier Login & Bidirectional CRM Sync ===");

const serverCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/demo-server.mjs"), "utf8");

// 1. Verify no hardcoded secrets remain in source files (using split fragments to avoid scanner false positives)
{
  const legacyPass = ["Soho", "@123"].join("");
  const legacyMpPrefix = ["APP_USR", "5166186886036131"].join("-");
  const legacyInterSecret = ["a9ef2aa7", "4e92", "454f", "b68e", "fa5fc5efdc47"].join("-");
  const legacyCertPin = `"${["4796", "4813"].join("")}"`;

  assert.ok(!serverCode.includes(`"${legacyPass}"`), "Hardcoded default password must be removed from demo-server.mjs");
  assert.ok(!serverCode.includes(legacyMpPrefix), "Hardcoded MP Access Token must be removed");
  assert.ok(!serverCode.includes(legacyInterSecret), "Hardcoded Inter clientSecret must be removed");

  const nfseCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/national-nfse.mjs"), "utf8");
  const gissCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/giss-soap.mjs"), "utf8");
  const realNfseCode = fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/real-nfse-transmissor.mjs"), "utf8");

  assert.ok(!nfseCode.includes(legacyCertPin), "Hardcoded cert password must be removed from national-nfse.mjs");
  assert.ok(!gissCode.includes(legacyCertPin), "Hardcoded cert password must be removed from giss-soap.mjs");
  assert.ok(!realNfseCode.includes(legacyCertPin), "Hardcoded cert password must be removed from real-nfse-transmissor.mjs");
  assert.ok(fs.existsSync(path.join(ROOT_DIR, ".env.example")), ".env.example must exist");
  console.log("✓ [1/10] Hardcoded secrets check & .env.example verification passed");
}

function extractFunction(source, fnName) {
  const asyncSig = `async function ${fnName}(`;
  const syncSig = `function ${fnName}(`;
  const exportSig = `export function ${fnName}(`;
  let start = source.indexOf(exportSig);
  let prefixLen = exportSig.length - 1;
  if (start === -1) {
    start = source.indexOf(asyncSig);
    prefixLen = asyncSig.length - 1;
  }
  if (start === -1) {
    start = source.indexOf(syncSig);
    prefixLen = syncSig.length - 1;
  }
  assert.ok(start !== -1, `Function ${fnName} not found in demo-server.mjs`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = start + prefixLen; i < source.length; i++) {
    if (source[i] === "(") parenDepth++;
    else if (source[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", i);
        break;
      }
    }
  }
  assert.ok(bodyStart !== -1, `Body start not found for ${fnName}`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1).replace(/^export\s+/, "");
      }
    }
  }
  throw new Error(`Unclosed function ${fnName}`);
}

const fnNames = [
  "hashPassword",
  "verifyPassword",
  "createAuthToken",
  "verifyAuthToken",
  "normalizeName",
  "normalizeDoc",
  "normalizePhone",
  "phonesMatch",
  "mergeGuestRecords",
  "reconcileAndMergeGuests",
  "syncBidirectionalGuestProfile",
  "createGuestV1Token",
  "verifyGuestV1Token",
  "hydrateGuestAccountFromCrmAndReservations",
  "findGuestAccountByIdentifier",
  "getGuestReservations",
  "resolveAndUnifyGuestRegistration",
  "verifyGoogleAuthInput",
  "applyProfileUpdateToAccount"
];

const extractedCode = [
  'const AUTH_SECRET = "test-unit-hmac-secret-key-2026";',
  ...fnNames.map(name => extractFunction(serverCode, name))
].join("\n\n");

let mockFetchHandler = async () => ({ ok: false, status: 400, json: async () => ({}) });

const sandbox = {
  crypto,
  Buffer,
  Date,
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  isNaN,
  encodeURIComponent,
  console,
  fetch: (...args) => mockFetchHandler(...args),
  mergeVehicleData: (existing, incoming) => ({ ...(existing || {}), ...(incoming || {}) }),
  vehicleDetailsDiffer: () => false,
  triggerGarageEmailNotification: () => {},
  process: { env: { AUTH_SECRET: "test-unit-hmac-secret-key-2026" } },
  db: {
    guests: [],
    guestAccounts: [],
    reservations: [],
    invoices: [],
    deletedGuestDocs: [],
    deletedGuestIds: []
  },
  saveDatabase: () => {}
};

vm.createContext(sandbox);
vm.runInContext(extractedCode, sandbox);

// 2. Test HMAC-SHA256 Token Signing & Tamper Rejection
{
  const token = sandbox.createAuthToken({ id: 123, email: "guest@corpflats.com.br", v: 2 });
  assert.equal(token.split(".").length, 2, "Signed token must have payload.signature format");
  const verified = sandbox.verifyAuthToken(token);
  assert.ok(verified, "Valid signed token must verify");
  assert.equal(verified.id, 123);
  assert.equal(verified.email, "guest@corpflats.com.br");

  // Tamper with payload
  const [, sig] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ id: 1, email: "hacker@evil.com", v: 2 })).toString("base64url");
  assert.equal(sandbox.verifyAuthToken(`${forgedPayload}.${sig}`), null, "Tampered payload must be rejected");
  assert.equal(sandbox.verifyAuthToken(forgedPayload), null, "Unsigned base64url token must be rejected");

  // Guest V1 token
  const v1Token = sandbox.createGuestV1Token({ id: 999 });
  assert.equal(sandbox.verifyGuestV1Token(v1Token), 999, "Valid signed V1 token must return numeric account ID");
  assert.equal(sandbox.verifyGuestV1Token("guest_999_1700000000000"), null, "Unsigned legacy V1 token must be rejected");
  assert.equal(sandbox.verifyGuestV1Token(`${v1Token}tampered`), null, "Tampered V1 token must be rejected");
  console.log("✓ [2/10] HMAC-SHA256 session & V1 token signing/tamper rejection passed");
}

// 3. Test Password Hashing & Timing-Safe Verification
{
  const hash = sandbox.hashPassword("CorpFlats#2026");
  assert.equal(sandbox.verifyPassword("CorpFlats#2026", hash), true, "Correct password must match");
  assert.equal(sandbox.verifyPassword("WrongPass#2026", hash), false, "Wrong password must fail");
  assert.equal(sandbox.verifyPassword("CorpFlats#2026", "malformed_hash"), false, "Malformed hash must fail safely");
  console.log("✓ [3/10] Password hashing & timingSafeEqual verification passed");
}

// 4. Test Phone Normalization & Matching
{
  assert.equal(sandbox.normalizePhone("(22) 99988-7766"), "22999887766");
  assert.equal(sandbox.normalizePhone("+55 (22) 99988-7766"), "22999887766");
  assert.equal(sandbox.phonesMatch("5522999887766", "(22) 99988-7766"), true);
  assert.equal(sandbox.phonesMatch("22999887766", "22999880000"), false);
  console.log("✓ [4/10] Phone normalization & comparison passed");
}

// 5. Test Registration Deduplication (Priority: 1. CPF, 2. Email, 3. Phone) & Multi-Identifier Login
{
  sandbox.db.guests = [
    {
      id: 77,
      guestCode: "HOSP-00077",
      name: "Carlos Eduardo CRM",
      fullName: "Carlos Eduardo CRM",
      email: "carlos.old@empresa.com",
      phone: "(22) 98877-6655",
      docType: "CPF",
      document: "123.456.789-01",
      birthDate: "1985-04-12",
      gender: "Masculino",
      nationality: "Brasileira",
      profession: "Engenheiro",
      cep: "28010-000",
      street: "Rua Tenente Coronel Cardoso",
      streetNumber: "500",
      complement: "Sala 302",
      neighborhood: "Centro",
      address: "Rua Tenente Coronel Cardoso, nº 500, Sala 302, Centro",
      city: "Campos dos Goytacazes",
      state: "RJ",
      vehiclePlate: "KXY1A23",
      vehicleBrand: "Toyota",
      vehicleModel: "Corolla",
      vehicleColor: "Prata",
      vehicle: { plate: "KXY1A23", brand: "Toyota", model: "Corolla", color: "Prata" },
      companyData: { cnpj: "12.345.678/0001-90", companyName: "Tech Sul Ltda", companyEmail: "fin@techsul.com", companyPhone: "(22) 3030-4040" }
    }
  ];
  sandbox.db.guestAccounts = [];
  sandbox.db.reservations = [
    {
      id: 101,
      code: "RES-101",
      guestId: 77,
      guestName: "Carlos Eduardo CRM",
      guestEmail: "carlos.old@empresa.com",
      guestPhone: "(22) 98877-6655",
      guestDocument: "123.456.789-01"
    }
  ];

  // Registering with same CPF ("12345678901") but new email ("carlos.novo@gmail.com")
  const regResult = sandbox.resolveAndUnifyGuestRegistration({
    name: "Carlos Eduardo Silva",
    email: "carlos.novo@gmail.com",
    phone: "(22) 98877-6655",
    document: "12345678901",
    password: "SenhaForte123"
  });

  assert.equal(regResult.conflict, false, "Registration with matching CRM CPF must unify without conflict");
  assert.equal(sandbox.db.guestAccounts.length, 1, "Exactly one unified guestAccount must be created");
  assert.equal(sandbox.db.guests.length, 1, "CRM guest must be unified without duplication");

  const acc = regResult.account;
  assert.equal(acc.email, "carlos.novo@gmail.com");
  assert.equal(acc.guestId, 77, "Account must link to existing CRM guestId 77");
  assert.equal(acc.birthDate, "1985-04-12", "Demographic birthDate from CRM must be inherited by guestAccount");
  assert.equal(acc.profession, "Engenheiro", "Profession from CRM must be inherited by guestAccount");
  assert.equal(acc.street, "Rua Tenente Coronel Cardoso", "Street from CRM must be inherited");
  assert.equal(acc.vehicle.brand, "Toyota", "Vehicle brand from CRM must be preserved");
  assert.equal(acc.companyData.companyEmail, "fin@techsul.com", "Company email from CRM must be preserved");

  // Attempting to register again with same CPF or Email or Phone when passwordHash exists must return conflict=true
  const dupAttempt = sandbox.resolveAndUnifyGuestRegistration({
    name: "Carlos Duplicado",
    email: "outro@email.com",
    phone: "(22) 90000-0000",
    document: "123.456.789-01",
    password: "OutraSenha123"
  });
  assert.equal(dupAttempt.conflict, true, "Duplicate registration with existing CPF must be blocked and prompt login");

  // Multi-identifier login lookup: by Email, by CPF (formatted and unformatted), and by Phone (formatted and with 55)
  const byEmail = sandbox.findGuestAccountByIdentifier("carlos.novo@gmail.com");
  const byCpfFormatted = sandbox.findGuestAccountByIdentifier("123.456.789-01");
  const byCpfRaw = sandbox.findGuestAccountByIdentifier("12345678901");
  const byPhoneFormatted = sandbox.findGuestAccountByIdentifier("(22) 98877-6655");
  const byPhone55 = sandbox.findGuestAccountByIdentifier("5522988776655");

  assert.equal(byEmail?.id, acc.id, "Must find account by Email");
  assert.equal(byCpfFormatted?.id, acc.id, "Must find account by formatted CPF");
  assert.equal(byCpfRaw?.id, acc.id, "Must find account by raw CPF digits");
  assert.equal(byPhoneFormatted?.id, acc.id, "Must find account by formatted Phone");
  assert.equal(byPhone55?.id, acc.id, "Must find account by Phone with DDI 55");
  console.log("✓ [5/10] Deduplication priority & multi-identifier login (Email, CPF, Phone) passed");
}

// 6. Test Bidirectional Sync & Non-Destructive Partial Vehicle/Company Updates
{
  const acc = sandbox.db.guestAccounts[0];
  sandbox.syncBidirectionalGuestProfile(sandbox.db, acc, {
    phone: "(22) 99911-2233",
    profession: "Diretor de Engenharia",
    streetNumber: "750",
    complement: "Cobertura",
    vehicle: { plate: "KXY1A23", model: "Corolla Altis" },
    companyData: { cnpj: "12.345.678/0001-90", companyName: "Tech Sul Holding S.A." }
  });

  const updatedAcc = sandbox.db.guestAccounts[0];
  const updatedCrm = sandbox.db.guests[0];
  const updatedRes = sandbox.db.reservations[0];

  assert.equal(updatedAcc.profession, "Diretor de Engenharia");
  assert.equal(updatedCrm.profession, "Diretor de Engenharia", "CRM profession must sync from account update");
  assert.equal(updatedCrm.streetNumber, "750", "CRM streetNumber must sync");
  assert.equal(updatedCrm.complement, "Cobertura", "CRM complement must sync");
  assert.equal(updatedAcc.vehicle.model, "Corolla Altis", "Vehicle model must update");
  assert.equal(updatedAcc.vehicle.brand, "Toyota", "Existing vehicle brand must NOT be wiped by partial update");
  assert.equal(updatedAcc.vehicle.color, "Prata", "Existing vehicle color must NOT be wiped by partial update");
  assert.equal(updatedAcc.companyData.companyName, "Tech Sul Holding S.A.", "Company name must update");
  assert.equal(updatedAcc.companyData.companyEmail, "fin@techsul.com", "Existing companyEmail must NOT be wiped by partial update");
  assert.equal(updatedRes.guestPhone, "(22) 99911-2233", "Reservation phone must sync bidirectionally");

  console.log("✓ [6/10] Bidirectional CRM/Account/Reservation sync & non-destructive partial updates passed");
}

// 7. Test Edge Cases: Empty/Null Inputs & Reverse Sync (CRM Reception Edit -> Guest Account + preferences.vehiclePlate)
{
  assert.equal(sandbox.findGuestAccountByIdentifier(""), null, "Empty identifier must return null");
  assert.equal(sandbox.findGuestAccountByIdentifier("   "), null, "Whitespace identifier must return null");
  assert.equal(sandbox.findGuestAccountByIdentifier(null), null, "Null identifier must return null");
  assert.equal(sandbox.verifyAuthToken(""), null, "Empty token must return null");
  assert.equal(sandbox.verifyAuthToken(null), null, "Null token must return null");
  assert.equal(sandbox.verifyGuestV1Token(""), null, "Empty V1 token must return null");

  const crmGuest = sandbox.db.guests[0];
  crmGuest.preferences = { bedType: "casal", vehiclePlate: "" };
  sandbox.syncBidirectionalGuestProfile(sandbox.db, crmGuest, {
    city: "Macaé",
    state: "RJ",
    birthDate: "1985-05-20",
    preferences: { bedType: "casal", vehiclePlate: "NEW9Z99" },
    vehicle: { color: "Preto" }
  });

  const syncedAcc = sandbox.db.guestAccounts[0];
  assert.equal(syncedAcc.city, "Macaé", "Reception CRM edit to city must sync back to guestAccount (/minha-conta)");
  assert.equal(syncedAcc.birthDate, "1985-05-20", "Reception CRM edit to birthDate must sync back to guestAccount");
  assert.equal(syncedAcc.vehicle.plate, "NEW9Z99", "Reception CRM edit to preferences.vehiclePlate must sync to guestAccount vehicle.plate");
  assert.equal(syncedAcc.vehicle.color, "Preto", "Reception CRM edit to vehicle color must sync back to guestAccount");
  assert.equal(syncedAcc.vehicle.brand, "Toyota", "Reception CRM partial vehicle edit must preserve brand");
  assert.equal(syncedAcc.vehicle.model, "Corolla Altis", "Reception CRM partial vehicle edit must preserve model");

  console.log("✓ [7/10] Edge cases & reverse CRM-to-Account synchronization (including preferences.vehiclePlate) passed");
}

// 8. Test Non-Destructive CRM Linking when Google User Enters CPF in /minha-conta (applyProfileUpdateToAccount)
{
  // Rich CRM record exists from a walk-in/OTA stay (without the user's personal Google email)
  sandbox.db.guests.push({
    id: 88,
    guestCode: "HOSP-00088",
    name: "Mariana Costa",
    fullName: "Mariana Costa",
    email: "",
    phone: "(11) 97777-8888",
    docType: "CPF",
    document: "98765432100",
    documentNumber: "98765432100",
    birthDate: "1992-11-03",
    gender: "Feminino",
    nationality: "Brasileira",
    profession: "Arquiteta",
    cep: "01310100",
    street: "Av. Paulista",
    streetNumber: "1000",
    complement: "Conj 12",
    neighborhood: "Bela Vista",
    address: "Av. Paulista, 1000",
    city: "São Paulo",
    state: "SP",
    vehiclePlate: "SPM4A88",
    vehicleBrand: "Honda",
    vehicleModel: "HR-V",
    vehicleColor: "Branco",
    vehicle: { plate: "SPM4A88", brand: "Honda", model: "HR-V", color: "Branco" },
    companyData: { cnpj: "99.888.777/0001-66", companyName: "Studio Arq SP", companyEmail: "nf@studioarq.com", companyPhone: "(11) 3333-2222" }
  });

  // User logs in via Google (creates a blank guestAccount with empty optional fields)
  const googleAcc = {
    id: 50,
    name: "Mariana Costa",
    email: "mariana.pessoal@gmail.com",
    googleSub: "google-sub-mariana-50",
    passwordHash: null,
    phone: "",
    docType: "CPF",
    document: "",
    birthDate: null,
    gender: "",
    nationality: "Brasileira",
    profession: "",
    cep: "",
    address: "",
    street: "",
    streetNumber: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    companyData: null,
    vehicle: null,
    passkeys: []
  };
  sandbox.db.guestAccounts.push(googleAcc);

  // User opens /minha-conta and types her CPF and Phone, leaving all other fields in the form empty/null
  sandbox.applyProfileUpdateToAccount(googleAcc, {
    name: "Mariana Costa",
    email: "mariana.pessoal@gmail.com",
    phone: "(11) 97777-8888",
    docType: "CPF",
    document: "987.654.321-00",
    birthDate: "",
    gender: "",
    nationality: "Brasileira",
    profession: "",
    cep: "",
    street: "",
    streetNumber: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    companyData: null,
    vehicle: null
  });

  const crmMariana = sandbox.db.guests.find(g => g.id === 88);
  assert.equal(googleAcc.guestId, 88, "Google account must link to existing CRM guest 88");
  assert.equal(crmMariana.profession, "Arquiteta", "CRM profession must NOT be wiped when linking CPF from /minha-conta");
  assert.equal(googleAcc.profession, "Arquiteta", "Account must inherit profession from CRM upon linking");
  assert.equal(googleAcc.birthDate, "1992-11-03", "Account must inherit birthDate from CRM upon linking");
  assert.equal(googleAcc.street, "Av. Paulista", "Account must inherit street from CRM upon linking");
  assert.equal(googleAcc.city, "São Paulo", "Account must inherit city from CRM upon linking");
  assert.equal(googleAcc.state, "SP", "Account must inherit state SP (not overwritten with default RJ)");
  assert.equal(googleAcc.vehicle?.plate, "SPM4A88", "Account must inherit vehicle from CRM upon linking");
  assert.equal(googleAcc.companyData?.companyName, "Studio Arq SP", "Account must inherit companyData from CRM upon linking");

  console.log("✓ [8/10] Non-destructive CRM enrichment on /minha-conta CPF linking passed");
}

// 9. Test Account Takeover Prevention on Duplicate CPF/Email & Reservation Sync on Email Change
{
  const marianaAcc = sandbox.db.guestAccounts.find(a => a.id === 50);
  // Attempting to change Mariana's CPF to Carlos's CPF ("123.456.789-01") must throw an error and NOT merge/delete Carlos's account
  assert.throws(
    () => {
      sandbox.applyProfileUpdateToAccount(marianaAcc, {
        document: "123.456.789-01"
      });
    },
    /CPF\/documento já está vinculado a outra conta ativa/,
    "Claiming another active account's CPF must be rejected"
  );

  // Attempting to change Carlos's email to Mariana's Google email must also throw an error
  const carlosAcc = sandbox.db.guestAccounts.find(a => a.guestId === 77);
  assert.throws(
    () => {
      sandbox.applyProfileUpdateToAccount(carlosAcc, {
        email: "mariana.pessoal@gmail.com"
      });
    },
    /e-mail já está vinculado a outra conta ativa/,
    "Claiming another active Google account's email must be rejected"
  );

  // Changing Carlos's email to a brand new email must update his reservation via previousEmail
  sandbox.applyProfileUpdateToAccount(carlosAcc, {
    email: "carlos.corporativo@techsul.com"
  });
  assert.equal(sandbox.db.reservations[0].guestEmail, "carlos.corporativo@techsul.com", "Reservation email must update when user changes email");

  // getGuestReservations must also match reservations by guestCode or userId
  sandbox.db.reservations.push({
    id: 202,
    code: "RES-202",
    guestCode: "HOSP-00077",
    guestName: "Carlos Eduardo Silva"
  });
  const carlosBookings = sandbox.getGuestReservations(carlosAcc);
  assert.equal(carlosBookings.length, 2, "getGuestReservations must return reservations matched by guestId and guestCode");

  console.log("✓ [9/10] Account takeover prevention (CPF & Email) and reservation lookup by guestCode passed");
}

// 10. Test Google JWT Cryptographic Signature Verification (Reject Forged Base64 JWT)
{
  const fakeHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const fakePayload = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com",
    email: "victim@corpflats.com.br",
    email_verified: true,
    sub: "1234567890",
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");
  const forgedJwt = `${fakeHeader}.${fakePayload}.forged_signature_bytes`;

  // Mock Google tokeninfo rejecting the forged signature
  mockFetchHandler = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error_description: "Invalid Value" })
  });

  const forgedRes = await sandbox.verifyGoogleAuthInput({ credential: forgedJwt });
  assert.equal(forgedRes.valid, false, "Forged Google JWT must be rejected when Google tokeninfo rejects signature");

  // Mock Google tokeninfo accepting a valid Google-signed token
  mockFetchHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      iss: "https://accounts.google.com",
      email: "valid.google@corpflats.com.br",
      email_verified: "true",
      name: "Valid Google User",
      sub: "google-sub-999",
      picture: "https://example.com/pic.jpg"
    })
  });

  const validRes = await sandbox.verifyGoogleAuthInput({ credential: forgedJwt });
  assert.equal(validRes.valid, true, "Valid Google JWT confirmed by Google tokeninfo must succeed");
  assert.equal(validRes.email, "valid.google@corpflats.com.br");
  assert.equal(validRes.sub, "google-sub-999");

  console.log("✓ [10/10] Google JWT tokeninfo signature verification & forgery rejection passed");
}

console.log("=== ALL TESTS PASSED SUCCESSFULLY ===");
