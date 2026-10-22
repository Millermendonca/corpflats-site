import crypto from "crypto";
import { isPrestadora, isCltEmployee, getEmployeeRawById } from "./employees.mjs";

/**
 * Módulo de Minutas Contratuais com Assinatura Canvas & Gestão de ASO (NR-7)
 * CorpFlats Soho Residence (Campos dos Goytacazes/RJ)
 * 
 * Legislação Aplicada:
 * - CLT (Decreto-Lei nº 5.452/1943): Arts. 442, 462, 59 § 5º.
 * - Lei nº 7.418/1985 e Decreto nº 95.247/1987 (Vale-Transporte).
 * - MP nº 2.200-2/2001 e Lei nº 14.063/2020 (Validade Jurídica de Assinatura Eletrônica).
 * - Norma Regulamentadora nº 7 (NR-7 / PCMSO - Portaria MTP nº 6.734/2020):
 *   Controle dos 5 tipos de ASO (Admissional, Periódico, Retorno, Mudança de Risco, Demissional).
 */

export const EMPLOYER_INFO = {
  companyName: "CorpFlats Soho Empreendimentos Hoteleiros LTDA",
  tradeName: "CorpFlats Soho Residence",
  cnpj: "12.345.678/0001-90",
  address: "Rua Tenente Coronel Cardoso, 450 - Centro",
  city: "Campos dos Goytacazes",
  state: "RJ",
  zipCode: "28010-801"
};

/**
 * Catálogo das 4 Minutas Contratuais Parametrizadas
 */
export const CONTRACT_TEMPLATES = {
  contrato_trabalho_clt: {
    id: "contrato_trabalho_clt",
    title: "Contrato Individual de Trabalho por Prazo Indeterminado (Regime 44h - 6x1)",
    category: "trabalhista",
    legalBasis: "Art. 442 e seguintes da CLT (Decreto-Lei nº 5.452/1943)"
  },
  termo_vale_transporte: {
    id: "termo_vale_transporte",
    title: "Termo de Opção e Autorização de Desconto de Vale-Transporte",
    category: "beneficios",
    legalBasis: "Lei nº 7.418/1985 e Decreto nº 95.247/1987"
  },
  acordo_banco_horas: {
    id: "acordo_banco_horas",
    title: "Acordo Individual para Compensação e Banco de Horas",
    category: "jornada",
    legalBasis: "Art. 59 § 5º da CLT (Lei nº 13.467/2017)"
  },
  termo_autorizacao_descontos: {
    id: "termo_autorizacao_descontos",
    title: "Termo de Autorização Prévia e Expressa para Descontos em Folha de Pagamento",
    category: "financeiro",
    legalBasis: "Art. 462 da CLT e Súmula nº 342 do TST"
  }
};

/**
 * Tipos Oficiais de Exames ASO (NR-7 / PCMSO)
 */
export const ASO_EXAM_TYPES = [
  "admissional",
  "periodico",
  "retorno_trabalho",
  "mudanca_risco",
  "demissional"
];

export const ASO_EXAM_LABELS = {
  admissional: "Exame Médico Admissional",
  periodico: "Exame Médico Periódico",
  retorno_trabalho: "Exame Médico de Retorno ao Trabalho",
  mudanca_risco: "Exame Médico de Mudança de Riscos Ocupacionais",
  demissional: "Exame Médico Demissional"
};

/**
 * Geração de Minuta Contratual Parametrizada
 * 
 * @param {string} templateId - Identificador do modelo de minuta
 * @param {object} employee - Dados cadastrais do funcionário CLT
 * @param {object} options - Opções adicionais de parametrização e persistência
 * @returns {object} Documento contratual gerado com hash SHA-256 e status "pending_signature"
 */
export function generateContractDocument(templateId, employee, options = {}) {
  const empId = employee?.id ?? employee?.userId ?? employee?.employeeId;
  const idStr = String(empId || "").toLowerCase().trim();

  // Blindagem estrita de Cris e Grazi
  if (empId === 2 || empId === 3 || empId === "2" || empId === "3" || idStr === "cris" || idStr === "grazi" || isPrestadora(employee)) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_CONTRACT_BLOCKED";
    throw err;
  }

  if (!isCltEmployee(employee)) {
    const err = new Error("Geração de contratos aplicável exclusivamente a colaboradores em regime CLT.");
    err.statusCode = 403;
    err.code = "NON_CLT_EMPLOYEE";
    throw err;
  }

  const template = CONTRACT_TEMPLATES[templateId];
  if (!template) {
    const err = new Error(`Modelo de minuta '${templateId}' não reconhecido.`);
    err.statusCode = 400;
    err.code = "INVALID_TEMPLATE_ID";
    throw err;
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  const dateFormatted = new Date(generatedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const empName = employee.name || employee.nickname || "Colaborador";
  const empCpf = employee.cpf || "000.000.000-00";
  const empRg = employee.rg || "Não informado";
  const empCtps = `${employee.ctpsNumber || "0000000"} / Série ${employee.ctpsSeries || "0000"}`;
  const empRole = employee.role || "Colaborador Operacional";
  const empSalary = Number(employee.baseSalary || 2400.00).toFixed(2).replace(".", ",");
  const empAddress = employee.address
    ? `${employee.address.street || ""}, ${employee.address.number || ""}${employee.address.complement ? ` (${employee.address.complement})` : ""}, ${employee.address.neighborhood || ""}, ${employee.address.city || "Campos dos Goytacazes"}/${employee.address.state || "RJ"}`
    : "Campos dos Goytacazes/RJ";

  let contentText = "";
  let contentHtml = "";

  switch (templateId) {
    case "contrato_trabalho_clt":
      contentText = `
CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO INDETERMINADO
REGIME DE JORNADA 44 HORAS SEMANAIS — ESCALA 6x1

EMPREGADOR: ${EMPLOYER_INFO.companyName} (${EMPLOYER_INFO.tradeName}), inscrito no CNPJ sob o nº ${EMPLOYER_INFO.cnpj}, com sede em ${EMPLOYER_INFO.address}, ${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}.
EMPREGADO: ${empName}, brasileiro(a), portador(a) do CPF nº ${empCpf}, RG nº ${empRg}, CTPS nº ${empCtps}, residente e domiciliado(a) em ${empAddress}.

CLÁUSULA PRIMEIRA — DO OBJETO E DA FUNÇÃO
O EMPREGADO é admitido para exercer a função de ${empRole}, executando todas as tarefas inerentes ao cargo e à operação hoteleira da unidade Soho Residence.

CLÁUSULA SEGUNDA — DA JORNADA DE TRABALHO E ESCALA 6x1
A jornada normal de trabalho será de 44 (quarenta e quatro) horas semanais, sob o regime de escala 6x1 (seis dias de trabalho por um dia de folga remunerada - DSR), com registro obrigatório em sistema de ponto eletrônico per Portaria MTP nº 671/2021.

CLÁUSULA TERCEIRA — DA REMUNERAÇÃO
Pela prestação dos serviços, o EMPREGADOR pagará ao EMPREGADO o salário base mensal de R$ ${empSalary} (${employee.baseSalaryExtenso || "reais"}), com pagamento mensal até o 5º dia útil do mês subsequente, mediante depósito bancário ou transferência instantânea PIX.

CLÁUSULA QUARTA — DO LOCAL DE PRESTAÇÃO DE SERVIÇOS
Os serviços serão prestados nas dependências do hotel CorpFlats Soho Residence, em ${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}.

CLÁUSULA QUINTA — DO FORO
Para dirimir quaisquer controvérsias decorrentes deste contrato, as partes elegem a Justiça do Trabalho da Comarca de ${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}.

${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}, ${dateFormatted}.
      `.trim();
      break;

    case "termo_vale_transporte":
      contentText = `
TERMO DE OPÇÃO E AUTORIZAÇÃO DE DESCONTO DE VALE-TRANSPORTE
(Lei nº 7.418/1985 e Decreto nº 95.247/1987)

COLABORADOR: ${empName} | CPF: ${empCpf} | CARGO: ${empRole}
EMPREGADOR: ${EMPLOYER_INFO.companyName} | CNPJ: ${EMPLOYER_INFO.cnpj}

DECLARAÇÃO DO COLABORADOR:
( X ) DECLARO optar pela utilização do Vale-Transporte para o deslocamento residência-trabalho-residência e AUTORIZO o desconto em folha de pagamento de até 6% (seis por cento) do meu salário base mensal, limitado ao custo real dos vales fornecidos.
(   ) DECLARO renunciar expressamente ao benefício de Vale-Transporte por utilizar condução própria.

Comprometo-me a utilizar o benefício estritamente para os deslocamentos de trabalho e a informar imediatamente qualquer alteração de endereço residencial.

${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}, ${dateFormatted}.
      `.trim();
      break;

    case "acordo_banco_horas":
      contentText = `
ACORDO INDIVIDUAL DE COMPENSAÇÃO E BANCO DE HORAS
(Art. 59 § 5º da CLT — Redação da Lei nº 13.467/2017)

Pelo presente instrumento particular, de um lado ${EMPLOYER_INFO.companyName} e de outro o(a) empregado(a) ${empName}, CPF nº ${empCpf}:

CLÁUSULA 1ª: Fica instituído o regime de Banco de Horas individual para compensação de jornada de trabalho, com prazo máximo de liquidação de 6 (seis) meses.
CLÁUSULA 2ª: A jornada diária não poderá exceder o limite legal de 10 (dez) horas totais trabalhadas, nem mais de 2 (duas) horas extras por dia.
CLÁUSULA 3ª: As horas acumuladas e não compensadas dentro do período de 6 meses ou no momento da rescisão contratual serão pagas com os adicionais legais de 50% ou 100%.

${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}, ${dateFormatted}.
      `.trim();
      break;

    case "termo_autorizacao_descontos":
      contentText = `
TERMO DE AUTORIZAÇÃO PRÉVIA E EXPRESSA PARA DESCONTOS EM FOLHA
(Art. 462 da CLT e Súmula nº 342 do Tribunal Superior do Trabalho)

COLABORADOR: ${empName} | CPF: ${empCpf}
EMPREGADOR: ${EMPLOYER_INFO.companyName} | CNPJ: ${EMPLOYER_INFO.cnpj}

Por este termo, AUTORIZO prévia e expressamente o EMPREGADOR a efetuar descontos em minha remuneração mensal nas seguintes hipóteses:
1. Adiantamentos salariais e vales quinzenais concedidos a meu pedido;
2. Danos, quebras, avarias ou prejuízos causados ao patrimônio do hotel ou dos hóspedes por dolo ou culpa comprovada (§ 1º do art. 462 da CLT);
3. Coparticipação ou custeio de benefícios (vale-transporte, refeição, plano de saúde quando contratado);
4. Faltas, atrasos e saídas antecipadas injustificados perante a escala de trabalho.

${EMPLOYER_INFO.city}/${EMPLOYER_INFO.state}, ${dateFormatted}.
      `.trim();
      break;
  }

  contentHtml = `
<div class="contract-document legal-minuta" data-template="${templateId}">
  <header style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px;">
    <h2 style="margin: 0; font-size: 1.25rem;">${EMPLOYER_INFO.tradeName.toUpperCase()}</h2>
    <p style="margin: 4px 0; font-size: 0.85rem; color: #555;">${EMPLOYER_INFO.companyName} — CNPJ: ${EMPLOYER_INFO.cnpj}</p>
    <h3 style="margin-top: 8px; font-size: 1.1rem; color: #1e3a8a;">${template.title}</h3>
  </header>
  <main style="line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap; font-family: monospace, sans-serif;">
${contentText}
  </main>
  <footer style="margin-top: 24px; border-top: 1px dashed #aaa; padding-top: 12px; font-size: 0.8rem; color: #666;">
    <p>Fundamentação Legal: ${template.legalBasis}</p>
  </footer>
</div>
  `.trim();

  const documentSha256 = crypto.createHash("sha256").update(contentText).digest("hex");
  const contractId = options.id || `contract_${empId}_${templateId}_${Date.now().toString(36)}`;

  const contractRecord = {
    id: contractId,
    templateId,
    templateTitle: template.title,
    employeeId: empId,
    employeeName: empName,
    cpf: empCpf,
    role: empRole,
    status: "pending_signature",
    contentHtml,
    contentText,
    documentSha256,
    signature: null,
    finalSealSha256: null,
    generatedAt,
    version: "1.0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Se db foi fornecido em options, persiste na coleção db.hrContracts
  if (options.db && Array.isArray(options.db.hrContracts)) {
    options.db.hrContracts.push(contractRecord);
  }

  return contractRecord;
}

/**
 * Assinatura Eletrônica de Contrato via Canvas
 * Coleta assinatura Base64 dataURL, metadados probatórios (IP, User-Agent, timestamp)
 * e gera selo digital criptográfico probatório (SHA-256) per MP 2.200-2/2001 e Lei 14.063/2020.
 * 
 * @param {object} db - Banco de dados em memória
 * @param {string} contractId - ID do contrato a ser assinado
 * @param {object} signaturePayload - Dados da assinatura capturada no canvas
 * @returns {object} Contrato atualizado com status "signed" e selo digital
 */
export function signContractWithCanvas(db, contractId, signaturePayload = {}) {
  // Guarda 1: contractId ou signaturePayload.employeeId contra prestadoras autônomas
  const contractIdStr = String(contractId || "").toLowerCase().trim();
  const payloadEmpId = signaturePayload?.employeeId;
  const payloadIdStr = String(payloadEmpId || "").toLowerCase().trim();

  if (
    contractId === 2 ||
    contractId === 3 ||
    contractId === "2" ||
    contractId === "3" ||
    contractIdStr === "cris" ||
    contractIdStr === "grazi" ||
    isPrestadora({ id: contractId, name: contractIdStr, username: contractIdStr })
  ) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_CONTRACT_BLOCKED";
    throw err;
  }

  if (
    payloadEmpId !== undefined && payloadEmpId !== null && (
      payloadEmpId === 2 ||
      payloadEmpId === 3 ||
      payloadEmpId === "2" ||
      payloadEmpId === "3" ||
      payloadIdStr === "cris" ||
      payloadIdStr === "grazi" ||
      isPrestadora({ id: payloadEmpId, name: payloadIdStr, username: payloadIdStr })
    )
  ) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_CONTRACT_BLOCKED";
    throw err;
  }

  if (!Array.isArray(db?.hrContracts)) {
    db.hrContracts = [];
  }

  const idx = db.hrContracts.findIndex(c => String(c.id) === String(contractId));
  if (idx === -1) {
    const err = new Error(`Contrato ${contractId} não encontrado.`);
    err.statusCode = 404;
    err.code = "CONTRACT_NOT_FOUND";
    throw err;
  }

  const contract = db.hrContracts[idx];

  // Guarda 2: Contrato persistido associado a prestadora autônoma
  const cEmpId = contract.employeeId;
  const cEmpIdStr = String(cEmpId || "").toLowerCase().trim();
  if (
    cEmpId === 2 ||
    cEmpId === 3 ||
    cEmpId === "2" ||
    cEmpId === "3" ||
    cEmpIdStr === "cris" ||
    cEmpIdStr === "grazi" ||
    isPrestadora({ id: cEmpId, name: cEmpIdStr, username: cEmpIdStr })
  ) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_CONTRACT_BLOCKED";
    throw err;
  }

  // Validação da assinatura em Canvas
  const dataUrl = signaturePayload.signatureDataUrl || signaturePayload.dataUrl || signaturePayload.signature;
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    const err = new Error("Assinatura em Canvas inválida ou ausente. É necessário enviar payload em Base64 dataURL.");
    err.statusCode = 400;
    err.code = "INVALID_SIGNATURE_PAYLOAD";
    throw err;
  }

  const ipAddress = signaturePayload.ipAddress || "127.0.0.1";
  const userAgent = signaturePayload.userAgent || "WebBrowser/Canvas";
  const signedAt = signaturePayload.signedAt || new Date().toISOString();

  // Cálculo dos hashes probatórios de autenticidade
  const signatureHash = crypto.createHash("sha256").update(dataUrl).digest("hex");
  const auditMetadataString = `${contract.documentSha256}|${signatureHash}|${ipAddress}|${userAgent}|${signedAt}`;
  const finalSealSha256 = crypto.createHash("sha256").update(auditMetadataString).digest("hex");

  contract.status = "signed";
  contract.signature = {
    dataUrl,
    signatureHash,
    ipAddress,
    userAgent,
    signedAt,
    legalNotice: "Assinatura eletrônica realizada com valor probatório pleno conforme MP nº 2.200-2/2001 e Lei nº 14.063/2020."
  };
  contract.finalSealSha256 = finalSealSha256;
  contract.signedAt = signedAt;
  contract.updatedAt = new Date().toISOString();

  db.hrContracts[idx] = contract;
  return contract;
}

/**
 * Consulta de Contratos
 */
export function getContracts(db, query = {}) {
  const list = Array.isArray(db?.hrContracts) ? db.hrContracts : [];

  return list
    .filter(c => {
      // Bloqueio de qualquer contrato de prestadora
      const cEmpId = c.employeeId;
      const cEmpIdStr = String(cEmpId || "").toLowerCase().trim();
      if (
        cEmpId === 2 ||
        cEmpId === 3 ||
        cEmpId === "2" ||
        cEmpId === "3" ||
        cEmpIdStr === "cris" ||
        cEmpIdStr === "grazi" ||
        isPrestadora({ id: cEmpId, name: cEmpIdStr, username: cEmpIdStr })
      ) {
        return false;
      }
      if (query.employeeId && String(c.employeeId) !== String(query.employeeId)) return false;
      if (query.templateId && c.templateId !== query.templateId) return false;
      if (query.status && c.status !== query.status) return false;
      return true;
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

// ── Gestão de Saúde Ocupacional / ASO (NR-7 e PCMSO) ─────────────────────────

/**
 * Cadastro e Histórico de Exames ASO (NR-7)
 * Suporta os 5 tipos legais: admissional, periodico, retorno_trabalho, mudanca_risco, demissional.
 * Calcula data de vencimento automática (1 ano padrão para admissional/periódico).
 * 
 * @param {object} db - Banco de dados em memória
 * @param {object} asoData - Dados do ASO realizado
 * @returns {object} Registro salvo na coleção db.hrAso / db.hrAsoRecords
 */
export function registerAsoExam(db, asoData = {}) {
  const empId = asoData.employeeId;
  const idStr = String(empId || "").toLowerCase().trim();

  // Blindagem estrita de Cris e Grazi
  if (empId === 2 || empId === 3 || empId === "2" || empId === "3" || idStr === "cris" || idStr === "grazi" || isPrestadora({ id: empId })) {
    const err = new Error("Operação não permitida para prestadoras de serviço autônomas (Cris e Grazi).");
    err.statusCode = 403;
    err.code = "PRESTADORA_ASO_BLOCKED";
    throw err;
  }

  const emp = getEmployeeRawById(db, empId);
  if (!emp) {
    const err = new Error(`Colaborador CLT ${empId} não encontrado.`);
    err.statusCode = 404;
    err.code = "EMPLOYEE_NOT_FOUND";
    throw err;
  }

  if (!isCltEmployee(emp)) {
    const err = new Error(`Colaborador ${empId} não é CLT.`);
    err.statusCode = 403;
    err.code = "NON_CLT_EMPLOYEE";
    throw err;
  }

  const examType = String(asoData.examType || "").toLowerCase().trim();
  if (!ASO_EXAM_TYPES.includes(examType)) {
    const err = new Error(`Tipo de exame ASO inválido: '${examType}'. Tipos aceitos: ${ASO_EXAM_TYPES.join(", ")}`);
    err.statusCode = 400;
    err.code = "INVALID_ASO_EXAM_TYPE";
    throw err;
  }

  const examDate = asoData.examDate || new Date().toISOString().substring(0, 10);

  // Cálculo automático do vencimento do ASO (padrão 1 ano para admissional e periódico per NR-7)
  let expirationDate = asoData.expirationDate;
  if (!expirationDate) {
    const [y, m, d] = examDate.split("-").map(Number);
    const nextYear = y + 1;
    const mStr = String(m).padStart(2, "0");
    const dStr = String(d).padStart(2, "0");
    expirationDate = `${nextYear}-${mStr}-${dStr}`;
  }

  const aptitudeStatus = asoData.aptitudeStatus || "apto"; // "apto" | "inapto" | "apto_com_restricoes"
  const asoId = asoData.id || `aso_${empId}_${Date.now().toString(36)}`;

  const asoRecord = {
    id: asoId,
    employeeId: empId,
    employeeName: emp.name,
    cpf: emp.cpf,
    role: emp.role,
    examType,
    examTypeName: ASO_EXAM_LABELS[examType] || examType,
    examDate,
    expirationDate,
    aptitudeStatus,
    clinicName: asoData.clinicName || "Clínica de Saúde Ocupacional Campos dos Goytacazes",
    doctorName: asoData.doctorName || "Dr. Médico Coordenador PCMSO",
    doctorCrm: asoData.doctorCrm || "CRM/RJ 123456",
    notes: asoData.notes || "",
    attachmentUrl: asoData.attachmentUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!Array.isArray(db.hrAso)) db.hrAso = [];
  if (!Array.isArray(db.hrAsoRecords)) db.hrAsoRecords = [];

  db.hrAso.push(asoRecord);
  db.hrAsoRecords.push(asoRecord);

  return asoRecord;
}

/**
 * Motor de Alertas Preventivos de ASO (NR-7)
 * Monitora 3 horizontes críticos:
 * - Vencidos (expired): expirationDate < referenceDate
 * - Vencendo em até 30 dias (expiring_30_days): expirationDate <= 30 dias
 * - Vencendo em até 60 dias (expiring_60_days): expirationDate entre 31 e 60 dias
 * 
 * @param {object} db - Banco de dados em memória
 * @param {object} options - Opções com referenceDate
 * @returns {{ referenceDate: string, totalAlerts: number, expired: object[], expiring_30_days: object[], expiring_60_days: object[] }}
 */
export function checkAsoAlerts(db, options = {}) {
  const referenceDate = options.referenceDate || new Date().toISOString().substring(0, 10);
  const refEpoch = new Date(`${referenceDate}T00:00:00Z`).getTime();

  const asoList = Array.isArray(db?.hrAso) ? db.hrAso : (Array.isArray(db?.hrAsoRecords) ? db.hrAsoRecords : []);

  const expired = [];
  const expiring_30_days = [];
  const expiring_60_days = [];

  for (const aso of asoList) {
    if (!aso.expirationDate) continue;

    const expEpoch = new Date(`${aso.expirationDate}T00:00:00Z`).getTime();
    const diffDays = Math.ceil((expEpoch - refEpoch) / (1000 * 60 * 60 * 24));

    const item = {
      ...aso,
      daysRemaining: diffDays
    };

    if (diffDays < 0) {
      expired.push({ ...item, alertLevel: "expired", message: `ASO vencido há ${Math.abs(diffDays)} dias.` });
    } else if (diffDays <= 30) {
      expiring_30_days.push({ ...item, alertLevel: "expiring_30_days", message: `ASO vence em ${diffDays} dias.` });
    } else if (diffDays <= 60) {
      expiring_60_days.push({ ...item, alertLevel: "expiring_60_days", message: `ASO vence em ${diffDays} dias.` });
    }
  }

  return {
    referenceDate,
    totalAlerts: expired.length + expiring_30_days.length + expiring_60_days.length,
    expired,
    expiring_30_days,
    expiring_60_days
  };
}

/**
 * Consulta de Registros de ASO
 */
export function getAsoRecords(db, query = {}) {
  const list = Array.isArray(db?.hrAso) ? db.hrAso : (Array.isArray(db?.hrAsoRecords) ? db.hrAsoRecords : []);

  return list
    .filter(a => {
      if (query.employeeId && String(a.employeeId) !== String(query.employeeId)) return false;
      if (query.examType && a.examType !== query.examType) return false;
      if (query.aptitudeStatus && a.aptitudeStatus !== query.aptitudeStatus) return false;
      return true;
    })
    .sort((a, b) => (b.examDate || "").localeCompare(a.examDate || ""));
}
