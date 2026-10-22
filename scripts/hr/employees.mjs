import crypto from "crypto";

/**
 * Módulo de Gestão de Funcionários CLT & Blindagem de Prestadoras
 * CorpFlats Soho Residence - Recursos Humanos
 */

export function hashPin(pin) {
  if (!pin) return "";
  return crypto.createHash("sha256").update(String(pin).trim()).digest("hex");
}

/**
 * Guarda de Identificação Estrita de Prestadoras de Serviço Autônomas (Diaristas)
 * Cris (id: 2) e Grazi (id: 3)
 */
export function isPrestadora(entity) {
  if (!entity || typeof entity !== "object") return false;
  const rawId = entity.id ?? entity.userId ?? entity.employeeId;
  const idNum = Number(rawId);
  if (idNum === 2 || idNum === 3 || rawId === "2" || rawId === "3") return true;

  const username = String(entity.username || "").toLowerCase().trim();
  if (username === "cris" || username === "grazi") return true;

  const name = String(entity.name || entity.nickname || "").toLowerCase().trim();
  if (name.includes("cris") || name.includes("grazi")) return true;

  const phone = String(entity.phone || entity.whatsapp || "").replace(/\D/g, "");
  if (phone.includes("22988486446") || phone.includes("22999106204")) return true;

  const contractType = String(entity.contractType || "").toLowerCase().trim();
  if (contractType === "prestador" || contractType === "prestadora" || contractType === "diarista") return true;

  return false;
}

/**
 * Guarda Mandatória para Validação de Funcionário CLT
 */
export function isCltEmployee(emp) {
  if (!emp || typeof emp !== "object") return false;
  if (isPrestadora(emp)) return false;
  if (emp.contractType !== "clt") return false;
  if (emp.isClt === false || emp.cltExempt === true) return false;
  return emp.active !== false;
}

/**
 * Assert de Segurança Máxima para Disparos e Notificações de Ponto/Folha
 */
export function validateRecipientNotPrestador(recipient) {
  if (isPrestadora(recipient)) {
    const recId = recipient?.id ?? recipient?.userId ?? recipient?.employeeId ?? "desconhecido";
    throw new Error(`[CRITICAL_SECURITY_VIOLATION] Bloqueio sumário: tentativa de acionar rotina CLT para prestadora autônoma (ID: ${recId})`);
  }
  return true;
}

/**
 * Sementes Seguras Iniciais de Funcionários CLT (Cozinha e Camareira)
 */
export function getDefaultHrEmployees() {
  const pinCozinha = "4021";
  const pinCamareira = "1234";

  return [
    {
      id: "emp_cozinha_01",
      matricula: "CLT-001",
      contractType: "clt",
      active: true,
      status: "ativo",
      name: "Sebastiana Ramos dos Santos",
      nickname: "Dona Tião / Cozinha",
      cpf: "123.456.789-01",
      rg: "12.345.678-9 DETRAN/RJ",
      birthDate: "1982-05-14",
      gender: "feminino",
      maritalStatus: "casado",
      address: {
        street: "Rua Tenente Coronel Cardoso",
        number: "450",
        complement: "Apto 202",
        neighborhood: "Centro",
        city: "Campos dos Goytacazes",
        state: "RJ",
        zipCode: "28010-801"
      },
      phone: "22998877665",
      whatsapp: "5522998877665",
      email: "sebastiana.ramos@corpflats.com.br",
      admissionDate: "2025-02-01",
      role: "Cozinheira Geral / Café da Manhã",
      department: "Cozinha / Alimentos & Bebidas",
      cbo: "5132-05",
      unionCategory: "Sindicato dos Trabalhadores em Hotéis, Bares e Restaurantes (Campos dos Goytacazes/RJ)",
      ctpsNumber: "1234567",
      ctpsSeries: "0010",
      ctpsUf: "RJ",
      pisPasep: "12345678901",
      workRegime: "6x1_44h",
      shiftType: "7h20_diarias",
      weeklyHours: 44,
      defaultSchedule: {
        entryTime: "06:00",
        breakStartTime: "10:30",
        breakEndTime: "11:30",
        breakDurationMinutes: 60,
        exitTime: "14:20",
        weeklyRestDay: "segunda"
      },
      scheduledLunchBreak: true,
      baseSalary: 1780.00,
      additionalInsalubridade: {
        enabled: true,
        percentage: 20,
        base: "salario_minimo"
      },
      additionalPericulosidade: {
        enabled: false,
        percentage: 30
      },
      additionalNightShift: {
        enabled: false,
        percentage: 20
      },
      transportVoucher: {
        optIn: true,
        deductionPercentage: 6
      },
      mealAllowance: {
        providedOnSite: true,
        deductionAmount: 0
      },
      pixKey: "22998877665",
      pixKeyType: "phone",
      bankDetails: {
        bankName: "Banco Itaú Unibanco S.A.",
        bankCode: "341",
        agency: "0150",
        accountNumber: "23456-7",
        accountType: "corrente"
      },
      pinHash: hashPin(pinCozinha),
      authorizedDeviceIds: [],
      functionalHistory: [
        {
          id: "hist_01",
          date: "2025-02-01",
          type: "admissao",
          description: "Admissão formal em regime CLT como Cozinheira Geral - Escala 6x1 (44h)",
          registeredBy: "admin",
          createdAt: "2025-02-01T08:00:00.000Z"
        }
      ],
      createdAt: "2025-02-01T08:00:00.000Z",
      updatedAt: "2025-02-01T08:00:00.000Z"
    },
    {
      id: "emp_camareira_01",
      matricula: "CLT-002",
      contractType: "clt",
      active: true,
      status: "ativo",
      name: "Luciana Moreira Ribeiro",
      nickname: "Luciana",
      cpf: "987.654.321-09",
      rg: "20.876.543-2 DETRAN/RJ",
      birthDate: "1989-11-23",
      gender: "feminino",
      maritalStatus: "solteiro",
      address: {
        street: "Avenida 28 de Março",
        number: "812",
        complement: "Casa B",
        neighborhood: "Turf Club",
        city: "Campos dos Goytacazes",
        state: "RJ",
        zipCode: "28015-010"
      },
      phone: "22997766554",
      whatsapp: "5522997766554",
      email: "luciana.ribeiro@corpflats.com.br",
      admissionDate: "2025-03-01",
      role: "Camareira de Hotel CLT",
      department: "Governança / Hospedagem",
      cbo: "5121-05",
      unionCategory: "Sindicato dos Trabalhadores em Hotéis, Bares e Restaurantes (Campos dos Goytacazes/RJ)",
      ctpsNumber: "7654321",
      ctpsSeries: "0020",
      ctpsUf: "RJ",
      pisPasep: "98765432109",
      workRegime: "6x1_44h",
      shiftType: "7h20_diarias",
      weeklyHours: 44,
      defaultSchedule: {
        entryTime: "08:00",
        breakStartTime: "12:00",
        breakEndTime: "13:00",
        breakDurationMinutes: 60,
        exitTime: "16:20",
        weeklyRestDay: "terca"
      },
      scheduledLunchBreak: true,
      baseSalary: 1650.00,
      additionalInsalubridade: {
        enabled: true,
        percentage: 20,
        base: "salario_minimo"
      },
      additionalPericulosidade: {
        enabled: false,
        percentage: 30
      },
      additionalNightShift: {
        enabled: false,
        percentage: 20
      },
      transportVoucher: {
        optIn: true,
        deductionPercentage: 6
      },
      mealAllowance: {
        providedOnSite: true,
        deductionAmount: 0
      },
      pixKey: "98765432109",
      pixKeyType: "cpf",
      bankDetails: {
        bankName: "Banco Bradesco S.A.",
        bankCode: "237",
        agency: "1420",
        accountNumber: "98765-4",
        accountType: "corrente"
      },
      pinHash: hashPin(pinCamareira),
      authorizedDeviceIds: [],
      functionalHistory: [
        {
          id: "hist_02",
          date: "2025-03-01",
          type: "admissao",
          description: "Admissão formal em regime CLT como Camareira de Hotel - Escala 6x1 (44h)",
          registeredBy: "admin",
          createdAt: "2025-03-01T08:00:00.000Z"
        }
      ],
      createdAt: "2025-03-01T08:00:00.000Z",
      updatedAt: "2025-03-01T08:00:00.000Z"
    }
  ];
}

/**
 * Sanitiza objeto de funcionário para não expor pinHash em consultas públicas/normais
 */
export function sanitizeEmployee(emp) {
  if (!emp) return null;
  const { pinHash, pin, ...safe } = emp;
  return {
    ...safe,
    pinConfigured: Boolean(pinHash || pin)
  };
}

/**
 * Calcula duração de intervalo intrajornada em minutos a partir de horários HH:MM
 */
export function calculateTimeDiffMinutes(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [h1, m1] = startTime.split(":").map(Number);
  const [h2, m2] = endTime.split(":").map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
  let totalMin1 = h1 * 60 + m1;
  let totalMin2 = h2 * 60 + m2;
  if (totalMin2 < totalMin1) {
    totalMin2 += 24 * 60; // cruza a meia-noite
  }
  return totalMin2 - totalMin1;
}

/**
 * CRUD: Obter lista de funcionários CLT filtrados
 */
export function getEmployees(db, query = {}) {
  const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees : [];
  
  return employees
    .filter(isCltEmployee)
    .filter(emp => {
      if (query.active !== undefined) {
        const wantActive = query.active === "true" || query.active === true;
        if (emp.active !== wantActive) return false;
      }
      if (query.department) {
        const dep = String(query.department).toLowerCase();
        if (!String(emp.department || "").toLowerCase().includes(dep)) return false;
      }
      if (query.role) {
        const role = String(query.role).toLowerCase();
        if (!String(emp.role || "").toLowerCase().includes(role)) return false;
      }
      if (query.search) {
        const search = String(query.search).toLowerCase();
        const match =
          String(emp.name || "").toLowerCase().includes(search) ||
          String(emp.nickname || "").toLowerCase().includes(search) ||
          String(emp.matricula || "").toLowerCase().includes(search) ||
          String(emp.cpf || "").includes(search);
        if (!match) return false;
      }
      return true;
    })
    .map(sanitizeEmployee);
}

/**
 * CRUD: Obter funcionário por ID ou matrícula
 */
export function getEmployeeById(db, id) {
  if (!id) return null;
  const strId = String(id).trim();
  
  // Bloqueio imediato para Prestadoras
  if (strId === "2" || strId === "3" || strId.toLowerCase() === "cris" || strId.toLowerCase() === "grazi") {
    return null;
  }

  const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees : [];
  const found = employees.find(
    e => String(e.id) === strId || String(e.matricula).toUpperCase() === strId.toUpperCase()
  );

  if (!found || !isCltEmployee(found)) return null;
  return sanitizeEmployee(found);
}

/**
 * CRUD: Obter funcionário raw interno (inclui pinHash para conferência no Ponto)
 */
export function getEmployeeRawById(db, id) {
  if (!id) return null;
  const strId = String(id).trim();
  if (strId === "2" || strId === "3" || strId.toLowerCase() === "cris" || strId.toLowerCase() === "grazi") {
    return null;
  }
  const employees = Array.isArray(db.hrEmployees) ? db.hrEmployees : [];
  const found = employees.find(
    e => String(e.id) === strId || String(e.matricula).toUpperCase() === strId.toUpperCase()
  );
  if (!found || !isCltEmployee(found)) return null;
  return found;
}

/**
 * CRUD: Criar novo funcionário CLT
 */
export function createEmployee(db, payload = {}, author = "admin") {
  if (!Array.isArray(db.hrEmployees)) db.hrEmployees = [];

  const name = String(payload.name || "").trim();
  if (name.length < 3) {
    throw new Error("Nome do funcionário é obrigatório e deve ter ao menos 3 caracteres.");
  }

  // Guarda estrita: rejeita nomes que contenham Cris ou Grazi para evitar confusão de cadastro
  const lowerName = name.toLowerCase();
  if (lowerName.includes("cris") || lowerName.includes("grazi")) {
    throw new Error("Operação rejeitada: Cris e Grazi são prestadoras de serviços autônomas e não podem ser cadastradas como funcionárias CLT.");
  }

  const cleanCpf = String(payload.cpf || "").replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    throw new Error("CPF inválido. Deve conter exatamente 11 dígitos numéricos.");
  }

  // Unicidade de CPF
  const existingCpf = db.hrEmployees.find(
    e => String(e.cpf || "").replace(/\D/g, "") === cleanCpf
  );
  if (existingCpf) {
    throw new Error(`Já existe um colaborador cadastrado com o CPF informado (${payload.cpf}).`);
  }

  // Gera Matrícula sequencial caso não fornecida
  let matricula = String(payload.matricula || "").trim().toUpperCase();
  if (!matricula) {
    const nextSeq = db.hrEmployees.length + 1;
    matricula = `CLT-${String(nextSeq).padStart(3, "0")}`;
  } else {
    const existingMat = db.hrEmployees.find(e => String(e.matricula).toUpperCase() === matricula);
    if (existingMat) {
      throw new Error(`Matrícula ${matricula} já está em uso por outro funcionário.`);
    }
  }

  // Validação da Jornada de Trabalho (Art. 71 CLT: intervalo >= 1h para jornadas > 6h)
  const defaultSchedule = payload.defaultSchedule || {};
  const entryTime = defaultSchedule.entryTime || "08:00";
  const exitTime = defaultSchedule.exitTime || "16:20";
  const breakStartTime = defaultSchedule.breakStartTime || "12:00";
  const breakEndTime = defaultSchedule.breakEndTime || "13:00";

  const totalShiftMinutes = calculateTimeDiffMinutes(entryTime, exitTime);
  const breakMinutes = calculateTimeDiffMinutes(breakStartTime, breakEndTime);

  if (totalShiftMinutes > 360 && breakMinutes < 60) {
    throw new Error("Conformidade CLT (Art. 71): Para jornadas diárias superiores a 6 horas, o intervalo de repouso e alimentação deve ser de no mínimo 60 minutos (1 hora).");
  }

  const baseSalary = Number(payload.baseSalary);
  if (isNaN(baseSalary) || baseSalary <= 0) {
    throw new Error("Salário base deve ser um valor numérico positivo.");
  }

  // Tratamento do PIN
  let pinHash = "";
  if (payload.pin) {
    const cleanPin = String(payload.pin).trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error("O PIN de ponto deve conter exatamente 4 dígitos numéricos.");
    }
    pinHash = hashPin(cleanPin);
  } else {
    // PIN padrão de 4 dígitos
    pinHash = hashPin("1234");
  }

  const newId = payload.id || `emp_clt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newEmployee = {
    id: newId,
    matricula,
    contractType: "clt",
    active: payload.active !== false,
    status: payload.status || "ativo",
    name,
    nickname: payload.nickname || name.split(" ")[0],
    cpf: payload.cpf,
    rg: payload.rg || "",
    birthDate: payload.birthDate || "",
    gender: payload.gender || "outro",
    maritalStatus: payload.maritalStatus || "solteiro",
    address: payload.address || {
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "Campos dos Goytacazes",
      state: "RJ",
      zipCode: ""
    },
    phone: payload.phone || "",
    whatsapp: payload.whatsapp || payload.phone || "",
    email: payload.email || "",
    admissionDate: payload.admissionDate || now.substring(0, 10),
    role: payload.role || "Colaborador(a) CLT",
    department: payload.department || "Operacional",
    cbo: payload.cbo || "5132-05",
    unionCategory: payload.unionCategory || "Sindicato dos Trabalhadores em Hotéis, Bares e Restaurantes (Campos dos Goytacazes/RJ)",
    ctpsNumber: payload.ctpsNumber || "",
    ctpsSeries: payload.ctpsSeries || "",
    ctpsUf: payload.ctpsUf || "RJ",
    pisPasep: payload.pisPasep || "",
    workRegime: "6x1_44h",
    shiftType: payload.shiftType || "7h20_diarias",
    weeklyHours: Number(payload.weeklyHours) || 44,
    defaultSchedule: {
      entryTime,
      breakStartTime,
      breakEndTime,
      breakDurationMinutes: breakMinutes || 60,
      exitTime,
      weeklyRestDay: defaultSchedule.weeklyRestDay || "domingo"
    },
    scheduledLunchBreak: payload.scheduledLunchBreak !== false,
    baseSalary,
    additionalInsalubridade: payload.additionalInsalubridade || {
      enabled: true,
      percentage: 20,
      base: "salario_minimo"
    },
    additionalPericulosidade: payload.additionalPericulosidade || {
      enabled: false,
      percentage: 30
    },
    additionalNightShift: payload.additionalNightShift || {
      enabled: false,
      percentage: 20
    },
    transportVoucher: payload.transportVoucher || {
      optIn: true,
      deductionPercentage: 6
    },
    mealAllowance: payload.mealAllowance || {
      providedOnSite: true,
      deductionAmount: 0
    },
    pixKey: payload.pixKey || "",
    pixKeyType: payload.pixKeyType || "cpf",
    bankDetails: payload.bankDetails || {
      bankName: "",
      bankCode: "",
      agency: "",
      accountNumber: "",
      accountType: "corrente"
    },
    pinHash,
    authorizedDeviceIds: Array.isArray(payload.authorizedDeviceIds) ? payload.authorizedDeviceIds : [],
    functionalHistory: [
      {
        id: `hist_${Date.now()}`,
        date: payload.admissionDate || now.substring(0, 10),
        type: "admissao",
        description: `Admissão formal em regime CLT - Cargo: ${payload.role || "Colaborador CLT"} - Jornada 6x1 (44h)`,
        registeredBy: author,
        createdAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  db.hrEmployees.push(newEmployee);
  return sanitizeEmployee(newEmployee);
}

/**
 * CRUD: Atualizar funcionário CLT com auditoria em functionalHistory
 */
export function updateEmployee(db, id, payload = {}, author = "admin") {
  if (!id) throw new Error("ID do funcionário é obrigatório.");
  const strId = String(id).trim();

  if (strId === "2" || strId === "3" || strId.toLowerCase() === "cris" || strId.toLowerCase() === "grazi") {
    throw new Error("Acesso negado: Prestadoras de serviço não podem ser alteradas pelo módulo de RH CLT.");
  }

  if (!Array.isArray(db.hrEmployees)) db.hrEmployees = [];
  const empIndex = db.hrEmployees.findIndex(
    e => String(e.id) === strId || String(e.matricula).toUpperCase() === strId.toUpperCase()
  );

  if (empIndex === -1) {
    throw new Error(`Funcionário CLT com ID ou Matrícula '${strId}' não encontrado.`);
  }

  const current = db.hrEmployees[empIndex];
  if (!isCltEmployee(current)) {
    throw new Error("A entidade informada não é um funcionário CLT ativo.");
  }

  const now = new Date().toISOString();
  const historyEntries = [...(current.functionalHistory || [])];

  // Auditoria de Salário
  if (payload.baseSalary !== undefined && Number(payload.baseSalary) !== current.baseSalary) {
    const newSalary = Number(payload.baseSalary);
    if (isNaN(newSalary) || newSalary <= 0) {
      throw new Error("Salário base deve ser um valor numérico positivo.");
    }
    historyEntries.push({
      id: `hist_sal_${Date.now()}`,
      date: now.substring(0, 10),
      type: "alteracao_salarial",
      description: `Reajuste salarial de R$ ${Number(current.baseSalary).toFixed(2)} para R$ ${newSalary.toFixed(2)}`,
      oldValue: current.baseSalary,
      newValue: newSalary,
      registeredBy: author,
      createdAt: now
    });
    current.baseSalary = newSalary;
  }

  // Auditoria de Cargo / Função
  if (payload.role && payload.role !== current.role) {
    historyEntries.push({
      id: `hist_role_${Date.now()}`,
      date: now.substring(0, 10),
      type: "mudanca_funcao",
      description: `Alteração de cargo de '${current.role}' para '${payload.role}'`,
      oldValue: current.role,
      newValue: payload.role,
      registeredBy: author,
      createdAt: now
    });
    current.role = payload.role;
  }

  // Auditoria de Status
  if (payload.status && payload.status !== current.status) {
    historyEntries.push({
      id: `hist_status_${Date.now()}`,
      date: now.substring(0, 10),
      type: payload.status === "ferias" ? "ferias" : (payload.status === "afastado" ? "afastamento" : "alteracao_status"),
      description: `Mudança de status funcional de '${current.status}' para '${payload.status}'`,
      oldValue: current.status,
      newValue: payload.status,
      registeredBy: author,
      createdAt: now
    });
    current.status = payload.status;
  }

  // Atualização de PIN
  if (payload.pin) {
    const cleanPin = String(payload.pin).trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error("O PIN de ponto deve conter exatamente 4 dígitos numéricos.");
    }
    current.pinHash = hashPin(cleanPin);
  }

  // Atualização de Escala Padrão e Validação Art. 71 CLT
  if (payload.defaultSchedule) {
    const updatedSchedule = { ...current.defaultSchedule, ...payload.defaultSchedule };
    const totalShiftMinutes = calculateTimeDiffMinutes(updatedSchedule.entryTime, updatedSchedule.exitTime);
    const breakMinutes = calculateTimeDiffMinutes(updatedSchedule.breakStartTime, updatedSchedule.breakEndTime);

    if (totalShiftMinutes > 360 && breakMinutes < 60) {
      throw new Error("Conformidade CLT (Art. 71): Para jornadas diárias superiores a 6 horas, o intervalo intrajornada deve ser de no mínimo 60 minutos (1 hora).");
    }
    current.defaultSchedule = {
      ...updatedSchedule,
      breakDurationMinutes: breakMinutes || 60
    };
  }

  // Atualizações de campos simples
  if (payload.name) {
    const newName = String(payload.name).trim();
    if (newName.toLowerCase().includes("cris") || newName.toLowerCase().includes("grazi")) {
      throw new Error("Operação rejeitada: Não é permitido atribuir nome de prestadoras autônomas a colaborador CLT.");
    }
    current.name = newName;
  }
  if (payload.nickname !== undefined) current.nickname = payload.nickname;
  if (payload.phone !== undefined) current.phone = payload.phone;
  if (payload.whatsapp !== undefined) current.whatsapp = payload.whatsapp;
  if (payload.email !== undefined) current.email = payload.email;
  if (payload.department !== undefined) current.department = payload.department;
  if (payload.cbo !== undefined) current.cbo = payload.cbo;
  if (payload.workRegime !== undefined) current.workRegime = payload.workRegime;
  if (payload.shiftType !== undefined) current.shiftType = payload.shiftType;
  if (payload.weeklyHours !== undefined) current.weeklyHours = Number(payload.weeklyHours);
  if (payload.active !== undefined) current.active = Boolean(payload.active);
  if (payload.additionalInsalubridade !== undefined) current.additionalInsalubridade = payload.additionalInsalubridade;
  if (payload.additionalPericulosidade !== undefined) current.additionalPericulosidade = payload.additionalPericulosidade;
  if (payload.additionalNightShift !== undefined) current.additionalNightShift = payload.additionalNightShift;
  if (payload.transportVoucher !== undefined) current.transportVoucher = payload.transportVoucher;
  if (payload.mealAllowance !== undefined) current.mealAllowance = payload.mealAllowance;
  if (payload.pixKey !== undefined) current.pixKey = payload.pixKey;
  if (payload.pixKeyType !== undefined) current.pixKeyType = payload.pixKeyType;
  if (payload.bankDetails !== undefined) current.bankDetails = payload.bankDetails;
  if (payload.address !== undefined) current.address = payload.address;
  if (payload.authorizedDeviceIds !== undefined && Array.isArray(payload.authorizedDeviceIds)) {
    current.authorizedDeviceIds = payload.authorizedDeviceIds;
  }

  current.functionalHistory = historyEntries;
  current.updatedAt = now;

  db.hrEmployees[empIndex] = current;
  return sanitizeEmployee(current);
}
