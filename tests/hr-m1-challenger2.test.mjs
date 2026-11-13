import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import {
  isPrestadora,
  isCltEmployee,
  validateRecipientNotPrestador,
  getDefaultHrEmployees,
  getEmployees,
  getEmployeeById,
  getEmployeeRawById,
  createEmployee,
  updateEmployee,
  hashPin
} from "../artifacts/api-server/hr/employees.mjs";
import {
  ensureHrCollections,
  createHrRouter
} from "../artifacts/api-server/hr/index.mjs";

test("CHALLENGER-2: 1.1 - isPrestadora robustez e casos extremos", () => {
  // Nulos, primitivos e objetos vazios
  assert.equal(isPrestadora(null), false);
  assert.equal(isPrestadora(undefined), false);
  assert.equal(isPrestadora("string"), false);
  assert.equal(isPrestadora(123), false);
  assert.equal(isPrestadora({}), false);

  // Identificação por ID numérico e string (Cris: 2, Grazi: 3)
  assert.equal(isPrestadora({ id: 2 }), true);
  assert.equal(isPrestadora({ id: 3 }), true);
  assert.equal(isPrestadora({ id: "2" }), true);
  assert.equal(isPrestadora({ id: "3" }), true);
  assert.equal(isPrestadora({ id: " 2 " }), true);
  assert.equal(isPrestadora({ id: " 3 " }), true);
  assert.equal(isPrestadora({ id: "02" }), true);
  assert.equal(isPrestadora({ id: "03" }), true);
  assert.equal(isPrestadora({ id: 2.0 }), true);
  assert.equal(isPrestadora({ userId: 2 }), true);
  assert.equal(isPrestadora({ userId: "3" }), true);
  assert.equal(isPrestadora({ employeeId: "2" }), true);
  assert.equal(isPrestadora({ employeeId: 3 }), true);

  // Identificação por username (casing e espaços)
  assert.equal(isPrestadora({ username: "cris" }), true);
  assert.equal(isPrestadora({ username: "CRIS" }), true);
  assert.equal(isPrestadora({ username: "  CrIs  " }), true);
  assert.equal(isPrestadora({ username: "grazi" }), true);
  assert.equal(isPrestadora({ username: "GRAZI" }), true);
  assert.equal(isPrestadora({ username: "  GrAzI  " }), true);

  // Identificação por name e nickname
  assert.equal(isPrestadora({ name: "Cristina" }), true);
  assert.equal(isPrestadora({ name: "CRISTINA SILVA" }), true);
  assert.equal(isPrestadora({ name: "  cris silva  " }), true);
  assert.equal(isPrestadora({ name: "Graziela" }), true);
  assert.equal(isPrestadora({ name: "GRAZIELA OLIVEIRA" }), true);
  assert.equal(isPrestadora({ nickname: "Criszinha" }), true);
  assert.equal(isPrestadora({ nickname: "Grazi" }), true);

  // Identificação por telefone/WhatsApp
  assert.equal(isPrestadora({ phone: "22988486446" }), true);
  assert.equal(isPrestadora({ phone: "(22) 98848-6446" }), true);
  assert.equal(isPrestadora({ phone: "+55 22 98848-6446" }), true);
  assert.equal(isPrestadora({ whatsapp: "5522999106204" }), true);
  assert.equal(isPrestadora({ whatsapp: "(22) 99910-6204" }), true);

  // Identificação por tipo de contrato prestador/diarista
  assert.equal(isPrestadora({ contractType: "prestador" }), true);
  assert.equal(isPrestadora({ contractType: "PRESTADORA" }), true);
  assert.equal(isPrestadora({ contractType: "  diarista  " }), true);

  // Não-prestadores legítimos
  assert.equal(isPrestadora({ id: 10, name: "Sebastiana Ramos", contractType: "clt" }), false);
  assert.equal(isPrestadora({ id: "emp_01", name: "Luciana Ribeiro", contractType: "clt" }), false);
});

test("CHALLENGER-2: 1.2 - isCltEmployee rejeição categórica de prestadoras e objetos inválidos", () => {
  // Objetos inválidos ou parciais
  assert.equal(isCltEmployee(null), false);
  assert.equal(isCltEmployee(undefined), false);
  assert.equal(isCltEmployee({}), false);
  assert.equal(isCltEmployee({ name: "Teste" }), false);
  assert.equal(isCltEmployee({ contractType: "pj" }), false);

  // Prestadoras disfarçadas de CLT
  assert.equal(isCltEmployee({ id: 2, contractType: "clt", active: true }), false);
  assert.equal(isCltEmployee({ id: 3, contractType: "clt", active: true }), false);
  assert.equal(isCltEmployee({ id: "2", contractType: "clt", active: true }), false);
  assert.equal(isCltEmployee({ name: "Cris Diarista", contractType: "clt", active: true }), false);
  assert.equal(isCltEmployee({ name: "Grazi Limpeza", contractType: "clt", active: true }), false);
  assert.equal(isCltEmployee({ username: "cris", contractType: "clt", active: true }), false);
  assert.equal(isCltEmployee({ phone: "22988486446", contractType: "clt", active: true }), false);

  // Inativos ou isentos
  assert.equal(isCltEmployee({ id: "emp_1", contractType: "clt", active: false }), false);
  assert.equal(isCltEmployee({ id: "emp_1", contractType: "clt", active: true, isClt: false }), false);
  assert.equal(isCltEmployee({ id: "emp_1", contractType: "clt", active: true, cltExempt: true }), false);

  // Funcionário CLT válido
  assert.equal(isCltEmployee({ id: "emp_1", name: "Sebastiana", contractType: "clt", active: true }), true);
});

test("CHALLENGER-2: 1.3 - validateRecipientNotPrestador proteção contra envio indevido", () => {
  assert.throws(() => validateRecipientNotPrestador({ id: 2 }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => validateRecipientNotPrestador({ id: "3" }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => validateRecipientNotPrestador({ name: "Cris Silva" }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => validateRecipientNotPrestador({ nickname: "Grazi" }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => validateRecipientNotPrestador({ phone: "22988486446" }), /CRITICAL_SECURITY_VIOLATION/);
  assert.throws(() => validateRecipientNotPrestador({ contractType: "diarista" }), /CRITICAL_SECURITY_VIOLATION/);

  // Destinatário válido
  assert.equal(validateRecipientNotPrestador({ id: "emp_01", name: "Sebastiana", contractType: "clt" }), true);
});

test("CHALLENGER-2: 1.4 - Tentativa de forçar ID 2 ou 3 em getEmployeeById e getEmployeeRawById", () => {
  const mockDb = {
    hrEmployees: [
      ...getDefaultHrEmployees(),
      // Inserção maliciosa de prestadora em hrEmployees para testar blindagem
      { id: 2, name: "Cris", contractType: "prestador", active: true },
      { id: 3, name: "Grazi", contractType: "prestador", active: true },
      { id: "2", name: "Cris String", contractType: "prestador", active: true },
      { id: "3", name: "Grazi String", contractType: "prestador", active: true }
    ]
  };

  // getEmployeeById deve retornar null para ID 2, 3, "2", "3", "cris", "grazi"
  assert.equal(getEmployeeById(mockDb, 2), null);
  assert.equal(getEmployeeById(mockDb, 3), null);
  assert.equal(getEmployeeById(mockDb, "2"), null);
  assert.equal(getEmployeeById(mockDb, "3"), null);
  assert.equal(getEmployeeById(mockDb, " 2 "), null);
  assert.equal(getEmployeeById(mockDb, " 3 "), null);
  assert.equal(getEmployeeById(mockDb, "cris"), null);
  assert.equal(getEmployeeById(mockDb, "grazi"), null);
  assert.equal(getEmployeeById(mockDb, "CRIS"), null);
  assert.equal(getEmployeeById(mockDb, "GRAZI"), null);

  // getEmployeeRawById deve também retornar null
  assert.equal(getEmployeeRawById(mockDb, 2), null);
  assert.equal(getEmployeeRawById(mockDb, 3), null);
  assert.equal(getEmployeeRawById(mockDb, "2"), null);
  assert.equal(getEmployeeRawById(mockDb, "3"), null);
  assert.equal(getEmployeeRawById(mockDb, "cris"), null);
  assert.equal(getEmployeeRawById(mockDb, "grazi"), null);

  // getEmployees nunca inclui as prestadoras
  const list = getEmployees(mockDb);
  assert.equal(list.length, 2);
  for (const emp of list) {
    assert.notEqual(emp.id, 2);
    assert.notEqual(emp.id, 3);
    assert.notEqual(emp.id, "2");
    assert.notEqual(emp.id, "3");
  }
});

test("CHALLENGER-2: 2.1 - Tentativa de cadastrar funcionário com nome Cris ou Grazi via createEmployee", () => {
  const mockDb = { hrEmployees: [] };

  // Variações de "Cris"
  assert.throws(
    () => createEmployee(mockDb, { name: "Cris", cpf: "11122233344", baseSalary: 1500 }),
    /prestadoras de serviços autônomas/
  );
  assert.throws(
    () => createEmployee(mockDb, { name: "  cRiS  ", cpf: "11122233344", baseSalary: 1500 }),
    /prestadoras de serviços autônomas/
  );
  assert.throws(
    () => createEmployee(mockDb, { name: "Cristina Maria dos Santos", cpf: "11122233344", baseSalary: 1500 }),
    /prestadoras de serviços autônomas/
  );

  // Variações de "Grazi"
  assert.throws(
    () => createEmployee(mockDb, { name: "Grazi", cpf: "11122233344", baseSalary: 1500 }),
    /prestadoras de serviços autônomas/
  );
  assert.throws(
    () => createEmployee(mockDb, { name: "  gRaZiElA  ", cpf: "11122233344", baseSalary: 1500 }),
    /prestadoras de serviços autônomas/
  );
});

test("CHALLENGER-2: 2.2 - Tentativa de cadastrar com jornada > 6h e intervalo < 1h (Art. 71 CLT)", () => {
  const mockDb = { hrEmployees: [] };

  // Caso 1: Jornada diária 8h (08:00 às 16:30 = 510 min) com almoço de 30min (12:00 às 12:30 = 30 min)
  assert.throws(
    () => createEmployee(mockDb, {
      name: "Carlos Eduardo da Silva",
      cpf: "11122233344",
      baseSalary: 1700,
      defaultSchedule: {
        entryTime: "08:00",
        exitTime: "16:30",
        breakStartTime: "12:00",
        breakEndTime: "12:30"
      }
    }),
    /Art\. 71/
  );

  // Caso 2: Jornada de 9h com almoço de 45min (12:00 às 12:45)
  assert.throws(
    () => createEmployee(mockDb, {
      name: "Carlos Eduardo da Silva",
      cpf: "11122233344",
      baseSalary: 1700,
      defaultSchedule: {
        entryTime: "08:00",
        exitTime: "17:00",
        breakStartTime: "12:00",
        breakEndTime: "12:45"
      }
    }),
    /Art\. 71/
  );

  // Caso 3: Jornada limítrofe de 6h05 (365 min) com almoço de 30min -> DEVE FALHAR
  assert.throws(
    () => createEmployee(mockDb, {
      name: "Carlos Eduardo da Silva",
      cpf: "11122233344",
      baseSalary: 1700,
      defaultSchedule: {
        entryTime: "08:00",
        exitTime: "14:05",
        breakStartTime: "11:00",
        breakEndTime: "11:30"
      }
    }),
    /Art\. 71/
  );

  // Caso 4: Jornada de 8h com almoço de 60min (12:00 às 13:00) -> DEVE PASSAR
  const valid = createEmployee(mockDb, {
    name: "Carlos Eduardo da Silva",
    cpf: "11122233344",
    baseSalary: 1700,
    defaultSchedule: {
      entryTime: "08:00",
      exitTime: "17:00",
      breakStartTime: "12:00",
      breakEndTime: "13:00"
    }
  });
  assert.equal(valid.name, "Carlos Eduardo da Silva");
  assert.equal(valid.defaultSchedule.breakDurationMinutes, 60);
});

test("CHALLENGER-2: 2.3 - Tentativa de cadastrar com salário <= 0 ou inválido", () => {
  const mockDb = { hrEmployees: [] };

  // Salário zero
  assert.throws(
    () => createEmployee(mockDb, { name: "Ana Paula Silva", cpf: "22233344455", baseSalary: 0 }),
    /Salário base deve ser um valor numérico positivo/
  );

  // Salário negativo
  assert.throws(
    () => createEmployee(mockDb, { name: "Ana Paula Silva", cpf: "22233344455", baseSalary: -100 }),
    /Salário base deve ser um valor numérico positivo/
  );
  assert.throws(
    () => createEmployee(mockDb, { name: "Ana Paula Silva", cpf: "22233344455", baseSalary: -0.01 }),
    /Salário base deve ser um valor numérico positivo/
  );

  // Salário string não numérica
  assert.throws(
    () => createEmployee(mockDb, { name: "Ana Paula Silva", cpf: "22233344455", baseSalary: "invalido" }),
    /Salário base deve ser um valor numérico positivo/
  );

  // Salário nulo ou indefinido
  assert.throws(
    () => createEmployee(mockDb, { name: "Ana Paula Silva", cpf: "22233344455" }),
    /Salário base deve ser um valor numérico positivo/
  );
});

test("CHALLENGER-2: 2.4 - Tentativa de cadastrar com CPF duplicado ou inválido", () => {
  const mockDb = {
    hrEmployees: getDefaultHrEmployees() // já contém 123.456.789-01 e 987.654.321-09
  };

  // CPF duplicado idêntico
  assert.throws(
    () => createEmployee(mockDb, { name: "Novo Funcionário", cpf: "123.456.789-01", baseSalary: 1600 }),
    /Já existe um colaborador cadastrado com o CPF informado/
  );

  // CPF duplicado sem pontuação
  assert.throws(
    () => createEmployee(mockDb, { name: "Novo Funcionário", cpf: "12345678901", baseSalary: 1600 }),
    /Já existe um colaborador cadastrado com o CPF informado/
  );

  // CPF duplicado com espaços
  assert.throws(
    () => createEmployee(mockDb, { name: "Novo Funcionário", cpf: " 987.654.321-09 ", baseSalary: 1600 }),
    /Já existe um colaborador cadastrado com o CPF informado/
  );

  // CPF com menos de 11 dígitos
  assert.throws(
    () => createEmployee(mockDb, { name: "Novo Funcionário", cpf: "123.456.789-0", baseSalary: 1600 }),
    /CPF inválido/
  );

  // CPF com mais de 11 dígitos
  assert.throws(
    () => createEmployee(mockDb, { name: "Novo Funcionário", cpf: "123.456.789-012", baseSalary: 1600 }),
    /CPF inválido/
  );
});

test("CHALLENGER-2: 2.5 - Tentativa de atualizar funcionário com salário <= 0 ou quebrar Art. 71 CLT via updateEmployee", () => {
  const mockDb = {
    hrEmployees: getDefaultHrEmployees()
  };

  // Tentar atualizar salário para zero ou negativo em emp_cozinha_01
  assert.throws(
    () => updateEmployee(mockDb, "emp_cozinha_01", { baseSalary: 0 }),
    /Salário base deve ser um valor numérico positivo/
  );
  assert.throws(
    () => updateEmployee(mockDb, "emp_cozinha_01", { baseSalary: -200 }),
    /Salário base deve ser um valor numérico positivo/
  );

  // Tentar alterar escala para jornada 8h com 30min de almoço
  assert.throws(
    () => updateEmployee(mockDb, "emp_cozinha_01", {
      defaultSchedule: {
        entryTime: "08:00",
        exitTime: "17:00",
        breakStartTime: "12:00",
        breakEndTime: "12:30"
      }
    }),
    /Art\. 71/
  );

  // Tentar renomear funcionário CLT para incluir "Cris"
  assert.throws(
    () => updateEmployee(mockDb, "emp_cozinha_01", { name: "Cris Cozinheira" }),
    /prestadoras autônomas/
  );

  // Tentar chamar updateEmployee com ID de prestadora (2 ou 3)
  assert.throws(
    () => updateEmployee(mockDb, 2, { baseSalary: 2000 }),
    /Acesso negado/
  );
  assert.throws(
    () => updateEmployee(mockDb, 3, { baseSalary: 2000 }),
    /Acesso negado/
  );
  assert.throws(
    () => updateEmployee(mockDb, "cris", { baseSalary: 2000 }),
    /Acesso negado/
  );
  assert.throws(
    () => updateEmployee(mockDb, "grazi", { baseSalary: 2000 }),
    /Acesso negado/
  );
});

test("CHALLENGER-2: 2.6 - Ataque adversarial aos Endpoints Express (/api/hr/*)", async () => {
  const mockDb = {};
  ensureHrCollections(mockDb);

  // Adiciona usuários prestadores no mockDb.users
  mockDb.users = [
    { id: 2, username: "Cris", name: "Cris", contractType: "prestador" },
    { id: 3, username: "Grazi", name: "Grazi", contractType: "prestador" }
  ];

  const app = express();
  app.use(express.json());
  app.use("/api/hr", createHrRouter({ db: mockDb, saveDatabase: () => {} }));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/hr`;

  try {
    // A1: GET /api/hr/employees/2 -> DEVE SER 404
    const resCris2 = await fetch(`${baseUrl}/employees/2`);
    assert.equal(resCris2.status, 404, "GET /employees/2 deve ser 404");
    const jsonCris2 = await resCris2.json();
    assert.equal(jsonCris2.success, false);

    // A2: GET /api/hr/employees/3 -> DEVE SER 404
    const resGrazi3 = await fetch(`${baseUrl}/employees/3`);
    assert.equal(resGrazi3.status, 404, "GET /employees/3 deve ser 404");

    // A3: GET /api/hr/employees/cris -> DEVE SER 404
    const resCrisName = await fetch(`${baseUrl}/employees/cris`);
    assert.equal(resCrisName.status, 404, "GET /employees/cris deve ser 404");

    // A4: GET /api/hr/employees/grazi -> DEVE SER 404
    const resGraziName = await fetch(`${baseUrl}/employees/grazi`);
    assert.equal(resGraziName.status, 404, "GET /employees/grazi deve ser 404");

    // A5: POST /api/hr/employees com nome "Grazi da Limpeza" -> DEVE RETORNAR 400
    const resPostGrazi = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Grazi da Limpeza",
        cpf: "33344455566",
        baseSalary: 1600
      })
    });
    assert.equal(resPostGrazi.status, 400);
    const jsonPostGrazi = await resPostGrazi.json();
    assert.match(jsonPostGrazi.error, /prestadoras de serviços autônomas/);

    // A6: POST /api/hr/employees com jornada 8h e almoço 30min -> DEVE RETORNAR 400
    const resPostLunch = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "José da Silva Operacional",
        cpf: "44455566677",
        baseSalary: 1600,
        defaultSchedule: {
          entryTime: "08:00",
          exitTime: "17:00",
          breakStartTime: "12:00",
          breakEndTime: "12:30" // 30 min
        }
      })
    });
    assert.equal(resPostLunch.status, 400);
    const jsonPostLunch = await resPostLunch.json();
    assert.match(jsonPostLunch.error, /Art\. 71/);

    // A7: POST /api/hr/employees com salário <= 0 -> DEVE RETORNAR 400
    const resPostZeroSal = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "José da Silva Operacional",
        cpf: "44455566677",
        baseSalary: 0
      })
    });
    assert.equal(resPostZeroSal.status, 400);
    const jsonPostZeroSal = await resPostZeroSal.json();
    assert.match(jsonPostZeroSal.error, /Salário base deve ser um valor numérico positivo/);

    // A8: POST /api/hr/employees com CPF duplicado -> DEVE RETORNAR 400
    const resPostDupCpf = await fetch(`${baseUrl}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "José da Silva Operacional",
        cpf: "123.456.789-01", // já existe em emp_cozinha_01
        baseSalary: 1600
      })
    });
    assert.equal(resPostDupCpf.status, 400);
    const jsonPostDupCpf = await resPostDupCpf.json();
    assert.match(jsonPostDupCpf.error, /Já existe um colaborador cadastrado com o CPF informado/);

    // A9: PATCH /api/hr/employees/2 -> DEVE RETORNAR 404
    const resPatch2 = await fetch(`${baseUrl}/employees/2`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseSalary: 2500 })
    });
    assert.equal(resPatch2.status, 404);

    // A10: PATCH /api/hr/employees/3 -> DEVE RETORNAR 404
    const resPatch3 = await fetch(`${baseUrl}/employees/3`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseSalary: 2500 })
    });
    assert.equal(resPatch3.status, 404);

  } finally {
    server.close();
  }
});
