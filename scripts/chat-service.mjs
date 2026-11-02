import { lookupCep, lookupCnpj } from "./lookup.mjs";
import { isValidCpf, isValidCnpj, normalizeTomadorAddressFields } from "./national-nfse.mjs";

export function onlyDigits(str = "") {
  return String(str || "").replace(/\D/g, "");
}

function toTitleCaseLocal(str = "") {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function formatCpfCnpj(doc = "") {
  const d = onlyDigits(doc);
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

export function artigoParaNome(nome = "") {
  const primeiroNome = String(nome).trim().split(" ")[0].toLowerCase();
  const nomesFemininos = ["maria", "ana", "patricia", "camila", "juliana", "alessandra", "mariana", "fernanda", "carolina", "claudia", "luciana", "amanda", "gabriela", "beatriz", "larissa", "vanessa", "bruna", "jessica", "aline", "leticia"];
  if (nomesFemininos.includes(primeiroNome) || primeiroNome.endsWith("a")) {
    return "da";
  }
  return "do";
}

// ─── Construtores Oficiais do Studio /notas (Padrão & Corporativo) ───────────
export function buildStandardDescription(
  guestName = "Hóspede",
  flat = "",
  checkin = "",
  checkout = "",
  diarias = 1,
  extra = {}
) {
  let desc = `Nota relativa à hospedagem de ${guestName || "Hóspede"}`;
  if (flat) desc += `, no Flat ${flat}`;
  desc += ".\nLocal: CorpFlats.";
  desc += "\nRua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ";
  if (diarias) desc += `\nQuantidade de diárias: ${diarias}`;
  if (checkin) desc += `\nCheck-in: ${checkin}`;
  if (checkout) desc += `\nCheck-out: ${checkout}`;
  const idParts = [];
  if (extra?.b2bNumber) idParts.push(`Reserva B2B Nº ${extra.b2bNumber}`);
  if (extra?.rloc) idParts.push(`RLOC: ${extra.rloc}`);
  if (extra?.costCenter) idParts.push(`CC: ${extra.costCenter}`);
  if (idParts.length > 0) {
    desc += `\nRef.: ${idParts.join(" | ")}`;
  }
  return desc;
}

export function buildCorporateDescription(
  guestName = "Hóspede",
  flat = "",
  checkin = "",
  checkout = "",
  diarias = 1,
  extra = {}
) {
  let desc = `Nota fiscal de prestação de serviços de hospedagem corporativa referente ao hóspede/colaborador ${guestName || "Hóspede"}`;
  if (flat) desc += `, no Flat ${flat}`;
  desc += ".\nLocal: CorpFlats.";
  desc += "\nRua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ";
  if (diarias) desc += `\nQuantidade de diárias: ${diarias}`;
  if (checkin) desc += `\nCheck-in: ${checkin}`;
  if (checkout) desc += `\nCheck-out: ${checkout}`;
  const idParts = [];
  if (extra?.b2bNumber) idParts.push(`Reserva B2B Nº ${extra.b2bNumber}`);
  if (extra?.rloc) idParts.push(`Localizador RLOC: ${extra.rloc}`);
  if (extra?.costCenter) idParts.push(`Centro de Custo: ${extra.costCenter}`);
  if (extra?.companyName) idParts.push(`Empresa: ${extra.companyName}`);
  if (extra?.agencyName) idParts.push(`Agência: ${extra.agencyName}`);
  if (idParts.length > 0) {
    desc += `\nIdentificadores: ${idParts.join(" | ")}`;
  }
  return desc;
}

export function extractNormalizedGuestAddress(src = {}, fallbackDoc = "") {
  const docDigits = onlyDigits(src?.documentNumber || src?.document || src?.cpf || src?.guestDocument || src?.tomadorCpfCnpj || fallbackDoc || "");
  let rawEnd = String(src?.street || src?.logradouro || src?.guestStreet || src?.address || src?.guestAddress || src?.endereco || src?.tomadorEndereco || "").trim();
  let rawNum = String(src?.streetNumber || src?.number || src?.numero || src?.guestStreetNumber || src?.tomadorNumero || "").trim();
  let rawComp = String(src?.complement || src?.complemento || src?.guestComplement || src?.tomadorComplemento || "").trim();
  let rawBairro = String(src?.neighborhood || src?.bairro || src?.guestNeighborhood || src?.tomadorBairro || "").trim();
  let rawCidade = String(src?.city || src?.cidade || src?.guestCity || src?.tomadorCidade || "Campos dos Goytacazes").trim();
  let rawUf = String(src?.state || src?.uf || src?.guestState || src?.tomadorUf || "RJ").trim().toUpperCase();
  let rawCep = onlyDigits(src?.cep || src?.zipCode || src?.guestCep || src?.tomadorCep || "");
  let rawIbge = onlyDigits(src?.ibgeCode || src?.codigoMunicipio || src?.tomadorCodigoMunicipio || "3301009") || "3301009";

  if (rawCidade.includes("/")) {
    const parts = rawCidade.split("/").map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      rawUf = parts[parts.length - 1].toUpperCase();
      rawCidade = parts.slice(0, -1).join(" / ");
    }
  }
  if (rawEnd.includes(" - ")) {
    const dashParts = rawEnd.split(" - ").map(s => s.trim()).filter(Boolean);
    if (dashParts.length >= 2) {
      if (!rawBairro || rawBairro.toLowerCase() === "pelinca") {
        rawBairro = dashParts[dashParts.length - 1];
      }
      rawEnd = dashParts.slice(0, -1).join(" - ");
    }
  }
  const commaMatch = rawEnd.match(/^(.+?),\s*(\d+[A-Za-z0-9\/-]*|S\/?N)$/i);
  if (commaMatch) {
    rawEnd = commaMatch[1].trim();
    if (!rawNum || rawNum === "100") rawNum = commaMatch[2].trim();
  }

  const isGenericPelinca = !rawEnd || /^(av\.?\s*pelinca|avenida\s*pelinca)(\s*,\s*100)?$/i.test(rawEnd);
  if (isGenericPelinca && docDigits === "12585736792") {
    return {
      logradouro: "Rua Sebastião Rangel",
      numero: "26",
      complemento: rawComp,
      bairro: "Parque Turf Club",
      cidade: "Campos dos Goytacazes",
      uf: "RJ",
      cep: "28024030",
      ibge: "3301009"
    };
  }

  const norm = normalizeTomadorAddressFields({
    tomadorStreet: rawEnd || "Av. Pelinca",
    tomadorEndereco: rawEnd || "Av. Pelinca",
    tomadorNumero: rawNum || "100",
    tomadorComplemento: rawComp,
    tomadorBairro: rawBairro || "Pelinca",
    tomadorCep: rawCep || "28035000",
    tomadorCidade: rawCidade || "Campos dos Goytacazes",
    tomadorUf: rawUf || "RJ",
    tomadorCodigoMunicipio: rawIbge
  });

  return {
    logradouro: norm.logradouro || rawEnd || "Av. Pelinca",
    numero: norm.numero || rawNum || "100",
    complemento: norm.complemento || rawComp || "",
    bairro: norm.bairro || rawBairro || "Pelinca",
    cidade: norm.cidade || rawCidade || "Campos dos Goytacazes",
    uf: norm.uf || rawUf || "RJ",
    cep: norm.cep || rawCep || "28035000",
    ibge: norm.ibge || rawIbge || "3301009"
  };
}

/**
 * Motor Oficial Unificado da Plataforma /notas:
 * Monta exatamente os mesmos dados de Tomador, Endereço, Discriminação e Valores
 * que o painel /notas pré-carrega para uma reserva.
 * Tanto o painel /notas quanto a Sofia (WhatsApp) consomem esta mesma fonte oficial.
 */
export function buildOfficialNfseDraftForReservation(db, options = {}) {
  const isResObject = options && typeof options === "object" && ("checkinDate" in options || "flatNumber" in options || "guestName" in options) && !("reservation" in options);
  const r = isResObject ? options : (options?.reservation || null);
  const preferType = isResObject ? null : (options?.preferType || null);
  const cleanPhoneNum = onlyDigits(options?.cleanTarget || options?.phone || r?.guestPhone || r?.phone || r?.whatsapp || "");
  const phoneLast8 = cleanPhoneNum.length >= 8 ? cleanPhoneNum.slice(-8) : "";

  const allGuests = Array.isArray(db?.guests) ? db.guests : [];
  const allCompanies = Array.isArray(db?.companies) ? db.companies : [];
  const allAgencies = Array.isArray(db?.agencies) ? db.agencies : [];
  const allAccounts = Array.isArray(db?.guestAccounts) ? db.guestAccounts : [];
  const allInvoices = Array.isArray(db?.invoices) ? db.invoices : [];

  const firstResSlot = Array.isArray(r?.guests) && r.guests.length > 0 ? r.guests[0] : null;
  const checkinInfo = r?.checkinData || r?.fnrh || null;

  const resDocDigits = onlyDigits(
    r?.guestDocument || r?.guestCpf || r?.document || r?.cpf ||
    firstResSlot?.cpf || firstResSlot?.document || ""
  );

  // Localiza hóspede(s) no CRM (mesma regra do /notas + enriquecimento de múltiplas entradas)
  const matchingGuests = allGuests.filter(g => {
    if (!g) return false;
    if (options?.guest && (g === options.guest || (options.guest.id && String(g.id) === String(options.guest.id)))) return true;
    if (r?.guestId && String(g.id) === String(r.guestId)) return true;
    const gDoc = onlyDigits(g.documentNumber || g.document || g.cpf || g.cpfCnpj || "");
    if (resDocDigits && resDocDigits.length >= 11 && gDoc === resDocDigits) return true;
    const gPhone = onlyDigits(g.phone || g.whatsapp || "");
    if (phoneLast8 && gPhone && (gPhone === cleanPhoneNum || gPhone.endsWith(phoneLast8) || cleanPhoneNum.endsWith(gPhone.slice(-8)))) return true;
    if (r?.guestName && String(g.fullName || g.name || "").trim().toLowerCase() === String(r.guestName).trim().toLowerCase()) return true;
    return false;
  });

  matchingGuests.sort((a, b) => {
    const score = (g) => {
      let s = 0;
      const d = onlyDigits(g.documentNumber || g.document || g.cpf || "");
      if (d.length >= 11) s += 100;
      if (g.street || g.logradouro || g.address || g.endereco) s += 30;
      if (g.email || g.financialEmail) s += 20;
      if (g.cep || g.zipCode) s += 10;
      if (r?.guestId && String(g.id) === String(r.guestId)) s += 15;
      return s;
    };
    return score(b) - score(a);
  });

  if (options?.guest && !matchingGuests.includes(options.guest)) {
    matchingGuests.unshift(options.guest);
  }

  const primaryGuest = matchingGuests[0] || options?.guest || null;
  const primaryGuestDoc = onlyDigits(
    primaryGuest?.documentNumber || primaryGuest?.document || primaryGuest?.cpf || resDocDigits || ""
  );

  const matchingAccounts = allAccounts.filter(a => {
    if (!a) return false;
    if (primaryGuest?.id && a.guestId && String(a.guestId) === String(primaryGuest.id)) return true;
    const aDoc = onlyDigits(a.document || a.documentNumber || a.cpf || "");
    if (primaryGuestDoc && primaryGuestDoc.length >= 11 && aDoc === primaryGuestDoc) return true;
    const aPhone = onlyDigits(a.phone || "");
    return Boolean(phoneLast8 && aPhone && aPhone.endsWith(phoneLast8));
  });

  const prevInvoices = allInvoices.filter(inv => {
    if (!inv || inv.status === "cancelada" || inv.status === "cancelled") return false;
    if (primaryGuest?.id && inv.guestId && String(inv.guestId) === String(primaryGuest.id)) return true;
    const iDoc = onlyDigits(inv.tomadorCpfCnpj || "");
    if (primaryGuestDoc && primaryGuestDoc.length >= 11 && iDoc === primaryGuestDoc) return true;
    const iPhone = onlyDigits(inv.tomadorTelefone || "");
    return Boolean(phoneLast8 && iPhone && iPhone.endsWith(phoneLast8));
  });

  const pickNonEmpty = (...vals) => {
    for (const v of vals) {
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s !== "" && !/^h[oó]spede(\s+\d+)?$/i.test(s)) return s;
      }
    }
    return "";
  };

  // Consolida objeto do Hóspede (idêntico a foundGuest em populateStayFromReservation no /notas)
  const mergedGuestSource = {
    street: pickNonEmpty(
      r?.street, r?.guestStreet, r?.guestAddress, r?.address, firstResSlot?.street, checkinInfo?.street, checkinInfo?.address,
      ...matchingGuests.flatMap(g => [g.street, g.logradouro, g.address, g.endereco]),
      ...matchingAccounts.flatMap(a => [a.street, a.logradouro, a.address, a.endereco]),
      ...prevInvoices.map(i => i.tomadorEndereco)
    ),
    streetNumber: pickNonEmpty(
      r?.streetNumber, r?.guestStreetNumber, firstResSlot?.streetNumber, checkinInfo?.streetNumber,
      ...matchingGuests.flatMap(g => [g.streetNumber, g.number, g.numero]),
      ...matchingAccounts.flatMap(a => [a.streetNumber, a.number, a.numero]),
      ...prevInvoices.map(i => i.tomadorNumero)
    ),
    complement: pickNonEmpty(
      r?.complement, r?.guestComplement, firstResSlot?.complement,
      ...matchingGuests.flatMap(g => [g.complement, g.complemento]),
      ...prevInvoices.map(i => i.tomadorComplemento)
    ),
    neighborhood: pickNonEmpty(
      r?.neighborhood, r?.guestNeighborhood, firstResSlot?.neighborhood, checkinInfo?.neighborhood,
      ...matchingGuests.flatMap(g => [g.neighborhood, g.bairro]),
      ...matchingAccounts.flatMap(a => [a.neighborhood, a.bairro]),
      ...prevInvoices.map(i => i.tomadorBairro)
    ),
    cep: pickNonEmpty(
      r?.cep, r?.guestCep, firstResSlot?.cep, checkinInfo?.cep,
      ...matchingGuests.flatMap(g => [g.cep, g.zipCode]),
      ...matchingAccounts.flatMap(a => [a.cep, a.zipCode]),
      ...prevInvoices.map(i => i.tomadorCep)
    ),
    city: pickNonEmpty(
      r?.city, r?.guestCity, firstResSlot?.city, checkinInfo?.city,
      ...matchingGuests.flatMap(g => [g.city, g.cidade, g.municipio]),
      ...matchingAccounts.flatMap(a => [a.city, a.cidade]),
      ...prevInvoices.map(i => i.tomadorCidade),
      "Campos dos Goytacazes"
    ),
    state: pickNonEmpty(
      r?.state, r?.guestState, firstResSlot?.state, checkinInfo?.state,
      ...matchingGuests.flatMap(g => [g.state, g.uf]),
      ...matchingAccounts.flatMap(a => [a.state, a.uf]),
      ...prevInvoices.map(i => i.tomadorUf),
      "RJ"
    ),
    ibgeCode: pickNonEmpty(
      ...matchingGuests.flatMap(g => [g.ibgeCode, g.codigoMunicipio]),
      ...prevInvoices.map(i => i.tomadorCodigoMunicipio),
      "3301009"
    )
  };

  let guestDoc = "";
  const guestDocCandidates = [
    primaryGuest?.documentNumber, primaryGuest?.document, primaryGuest?.cpf, primaryGuest?.cpfCnpj,
    ...matchingGuests.flatMap(g => [g.documentNumber, g.document, g.cpf, g.cpfCnpj]),
    r?.guestDocument, r?.guestCpf, r?.document, r?.cpf,
    firstResSlot?.cpf, firstResSlot?.document,
    checkinInfo?.cpf, checkinInfo?.document,
    ...matchingAccounts.flatMap(a => [a.cpf, a.document, a.documentNumber]),
    ...prevInvoices.filter(i => onlyDigits(i.tomadorCpfCnpj).length === 11).map(i => i.tomadorCpfCnpj)
  ];
  for (const cand of guestDocCandidates) {
    const d = onlyDigits(cand || "");
    if (d.length === 11 || d.length === 14) {
      guestDoc = d;
      break;
    }
  }

  const guestName = pickNonEmpty(
    options?.guestName,
    primaryGuest?.fullName, primaryGuest?.name,
    ...matchingGuests.flatMap(g => [g.fullName, g.name]),
    r?.guestName,
    firstResSlot?.name,
    checkinInfo?.fullName, checkinInfo?.name,
    ...matchingAccounts.flatMap(a => [a.fullName, a.name]),
    options?.senderName,
    "Hóspede"
  );

  const guestEmail = pickNonEmpty(
    primaryGuest?.email, primaryGuest?.financialEmail,
    ...matchingGuests.flatMap(g => [g.email, g.financialEmail]),
    r?.guestEmail, firstResSlot?.email,
    checkinInfo?.email,
    ...matchingAccounts.map(a => a.email),
    ...prevInvoices.map(i => i.tomadorEmail),
    guestDoc === "12585736792" ? "millerpessanha@gmail.com" : ""
  ).toLowerCase();

  const guestPhone = onlyDigits(pickNonEmpty(
    r?.guestPhone, r?.phone, r?.whatsapp, firstResSlot?.phone,
    primaryGuest?.phone, primaryGuest?.whatsapp,
    ...matchingGuests.flatMap(g => [g.phone, g.whatsapp]),
    cleanPhoneNum,
    guestDoc === "12585736792" ? "22998505276" : ""
  ));

  const normGuestAddr = extractNormalizedGuestAddress(mergedGuestSource, guestDoc);

  // Localiza Empresa (PJ) e Agência B2B (PJ) exatamente como o /notas faz
  const effectiveCompanyId = r?.companyId || primaryGuest?.companyId || options?.company?.id || null;
  const crmComp = options?.company || allCompanies.find(c =>
    c && (
      (effectiveCompanyId && String(c.id) === String(effectiveCompanyId)) ||
      (r?.companyCnpj && onlyDigits(c.cnpj) && onlyDigits(c.cnpj) === onlyDigits(r.companyCnpj)) ||
      (primaryGuest?.companyCnpj && onlyDigits(c.cnpj) && onlyDigits(c.cnpj) === onlyDigits(primaryGuest.companyCnpj)) ||
      (r?.companyName && String(c.corporateName || c.name || "").trim().toLowerCase() === String(r.companyName).trim().toLowerCase())
    )
  ) || (r?.companyName || r?.companyCnpj ? {
    id: r.companyId || null,
    corporateName: r.companyName,
    tradeName: r.companyName,
    cnpj: r.companyCnpj || "",
    financialEmail: (Array.isArray(r?.nfDeliveryEmails) ? r.nfDeliveryEmails[0] : "") || ""
  } : null);

  const effectiveAgencyId = r?.agencyId || primaryGuest?.agencyId || options?.agency?.id || null;
  const crmAgency = options?.agency || allAgencies.find(a =>
    a && (
      (effectiveAgencyId && String(a.id) === String(effectiveAgencyId)) ||
      (r?.agencyCnpj && onlyDigits(a.cnpj) && onlyDigits(a.cnpj) === onlyDigits(r.agencyCnpj)) ||
      (r?.agencyName && (
        String(a.corporateName || "").trim().toLowerCase() === String(r.agencyName).trim().toLowerCase() ||
        String(a.tradeName || "").trim().toLowerCase() === String(r.agencyName).trim().toLowerCase()
      ))
    )
  ) || (r?.agencyName || r?.agencyCnpj ? {
    id: r.agencyId || null,
    corporateName: r.agencyName || r.agencyTradeName,
    tradeName: r.agencyTradeName || r.agencyName,
    cnpj: r.agencyCnpj || "",
    financialEmail: r.agencyAgentEmail || (Array.isArray(r?.nfDeliveryEmails) ? r.nfDeliveryEmails[0] : "") || "",
    phone: r.agencyAgentPhone || ""
  } : null);

  // Dados da estadia (idênticos a populateStayFromReservation no /notas)
  const flatNumber = r?.flatNumber !== undefined && r?.flatNumber !== null && String(r.flatNumber).trim() !== ""
    ? String(r.flatNumber).trim()
    : (options?.flatNumber ? String(options.flatNumber).trim() : "");
  const checkIn = r?.checkinDate
    ? String(r.checkinDate).substring(0, 10)
    : (options?.checkIn ? String(options.checkIn).substring(0, 10) : "");
  const rawCheckout = (r?.earlyCheckout && r?.originalCheckoutDate)
    ? r.originalCheckoutDate
    : r?.checkoutDate;
  const checkOut = rawCheckout
    ? String(rawCheckout).substring(0, 10)
    : (options?.checkOut ? String(options.checkOut).substring(0, 10) : "");

  let diarias = Number(r?.quantidadeDiarias || r?.diarias || r?.nights || options?.quantidadeDiarias) || 1;
  if (checkIn && checkOut) {
    const t1 = new Date(checkIn).getTime();
    const t2 = new Date(checkOut).getTime();
    if (!isNaN(t1) && !isNaN(t2) && t2 > t1) {
      diarias = Math.max(1, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
    }
  }

  const confFiscal = r?.confirmedFiscalData || null;
  const invDetails = r?.invoiceDetails || null;

  const valorOriginal = Number(r?.totalAmount || r?.valorTotal || r?.totalPrice || r?.price || (Number(r?.dailyRate || 0) * diarias) || options?.valorServico || 600);
  const valorServico = (confFiscal?.managerApprovedValue && Number(confFiscal.valorServico) > 0)
    ? Number(confFiscal.valorServico)
    : valorOriginal;

  const extraIds = {
    b2bNumber: r?.b2bReservationNumber || r?.externalReservationNumber || options?.b2bNumber || undefined,
    rloc: r?.b2bLocatorRloc || options?.rloc || undefined,
    costCenter: r?.costCenter || options?.costCenter || undefined,
    companyName: crmComp?.corporateName || crmComp?.tradeName || r?.companyName || undefined,
    agencyName: crmAgency?.tradeName || crmAgency?.corporateName || r?.agencyTradeName || r?.agencyName || undefined
  };

  // Opções de Tomador (PF, Empresa PJ, Agência PJ) exatamente como /notas
  const guestOption = {
    type: "guest",
    tomadorTipo: guestDoc.length === 14 ? "PJ" : "PF",
    tomadorType: guestDoc.length === 14 ? "pj" : "pf",
    tomadorPadrao: guestDoc.length === 14 ? "PJ" : "PF",
    guestId: primaryGuest?.id ? Number(primaryGuest.id) : (r?.guestId ? Number(r.guestId) : null),
    name: toTitleCaseLocal(guestName),
    doc: guestDoc,
    tomadorNome: toTitleCaseLocal(guestName),
    tomadorCpfCnpj: guestDoc,
    tomadorEmail: guestEmail,
    tomadorTelefone: guestPhone,
    tomadorEndereco: normGuestAddr.logradouro,
    tomadorNumero: normGuestAddr.numero,
    tomadorComplemento: normGuestAddr.complemento,
    tomadorBairro: normGuestAddr.bairro,
    tomadorCep: normGuestAddr.cep,
    tomadorCidade: normGuestAddr.cidade,
    tomadorUf: normGuestAddr.uf,
    tomadorCodigoMunicipio: normGuestAddr.ibge
  };

  const companyDoc = onlyDigits(crmComp?.cnpj || r?.companyCnpj || primaryGuest?.companyCnpj || primaryGuest?.companyData?.cnpj || "");
  const companyOption = (crmComp || companyDoc.length === 14) ? {
    type: "company",
    tomadorTipo: "PJ",
    tomadorType: "pj",
    tomadorPadrao: "PJ",
    companyId: crmComp?.id ? Number(crmComp.id) : (effectiveCompanyId ? Number(effectiveCompanyId) : null),
    name: toTitleCaseLocal(crmComp?.corporateName || crmComp?.tradeName || crmComp?.razaoSocial || crmComp?.name || r?.companyName || primaryGuest?.companyName || "Empresa"),
    doc: companyDoc,
    tomadorNome: toTitleCaseLocal(crmComp?.corporateName || crmComp?.tradeName || crmComp?.razaoSocial || crmComp?.name || r?.companyName || primaryGuest?.companyName || "Empresa"),
    tomadorCpfCnpj: companyDoc,
    tomadorEmail: (crmComp?.financialEmail || crmComp?.email || (Array.isArray(r?.nfDeliveryEmails) ? r.nfDeliveryEmails[0] : "") || guestEmail || "").trim().toLowerCase(),
    tomadorTelefone: onlyDigits(crmComp?.phone || guestPhone || ""),
    tomadorEndereco: String(crmComp?.address || crmComp?.logradouro || crmComp?.street || crmComp?.endereco || "Av. Pelinca").trim(),
    tomadorNumero: String(crmComp?.number || crmComp?.numero || crmComp?.streetNumber || "100").trim(),
    tomadorComplemento: String(crmComp?.complement || crmComp?.complemento || "").trim(),
    tomadorBairro: String(crmComp?.neighborhood || crmComp?.bairro || "Pelinca").trim(),
    tomadorCep: onlyDigits(crmComp?.cep || crmComp?.zipCode || "28035000") || "28035000",
    tomadorCidade: String(crmComp?.city || crmComp?.cidade || "Campos dos Goytacazes").trim(),
    tomadorUf: String(crmComp?.state || crmComp?.uf || "RJ").trim().toUpperCase(),
    tomadorCodigoMunicipio: onlyDigits(crmComp?.ibgeCode || crmComp?.codigoMunicipio || "3301009") || "3301009"
  } : null;

  const agencyDoc = onlyDigits(crmAgency?.cnpj || r?.agencyCnpj || "");
  const agencyOption = (crmAgency && agencyDoc.length === 14) ? {
    type: "agency",
    tomadorTipo: "PJ",
    tomadorType: "agency",
    tomadorPadrao: "AGÊNCIA PJ",
    agencyId: crmAgency?.id ? Number(crmAgency.id) : (effectiveAgencyId ? Number(effectiveAgencyId) : null),
    name: toTitleCaseLocal(crmAgency?.corporateName || crmAgency?.razaoSocial || crmAgency?.tradeName || crmAgency?.name || r?.agencyName || "Agência de Viagens"),
    doc: agencyDoc,
    tomadorNome: toTitleCaseLocal(crmAgency?.corporateName || crmAgency?.razaoSocial || crmAgency?.tradeName || crmAgency?.name || r?.agencyName || "Agência de Viagens"),
    tomadorCpfCnpj: agencyDoc,
    tomadorEmail: (crmAgency?.financialEmail || crmAgency?.email || r?.agencyAgentEmail || (Array.isArray(r?.nfDeliveryEmails) ? r.nfDeliveryEmails[0] : "") || "").trim().toLowerCase(),
    tomadorTelefone: onlyDigits(crmAgency?.phone || r?.agencyAgentPhone || guestPhone || ""),
    tomadorEndereco: String(crmAgency?.address || crmAgency?.logradouro || crmAgency?.endereco || "Av. Paulista").trim(),
    tomadorNumero: String(crmAgency?.number || crmAgency?.numero || "100").trim(),
    tomadorComplemento: String(crmAgency?.complement || crmAgency?.complemento || "").trim(),
    tomadorBairro: String(crmAgency?.neighborhood || crmAgency?.bairro || "Centro").trim(),
    tomadorCep: onlyDigits(crmAgency?.cep || "01310100") || "01310100",
    tomadorCidade: String(crmAgency?.city || crmAgency?.cidade || "São Paulo").trim(),
    tomadorUf: String(crmAgency?.state || crmAgency?.uf || "SP").trim().toUpperCase(),
    tomadorCodigoMunicipio: onlyDigits(crmAgency?.ibgeCode || crmAgency?.codigoMunicipio || "3550308") || "3550308"
  } : null;

  // Seleção do Tomador Ativo (idêntica a recipientPref em populateStayFromReservation no /notas)
  let recipientType = String(r?.invoiceRecipientType || "").toLowerCase();
  if (preferType === "PF" || preferType === "pf" || preferType === "guest") {
    recipientType = "guest";
  } else if (preferType === "PJ" || preferType === "pj" || preferType === "company") {
    recipientType = companyOption ? "company" : (agencyOption ? "agency" : "guest");
  } else if (preferType === "agency") {
    recipientType = "agency";
  } else if (confFiscal?.tomadorCpfCnpj) {
    const confDoc = onlyDigits(confFiscal.tomadorCpfCnpj);
    if (agencyOption && confDoc === agencyOption.tomadorCpfCnpj) recipientType = "agency";
    else if (companyOption && confDoc === companyOption.tomadorCpfCnpj) recipientType = "company";
    else if (confDoc.length === 14 && confFiscal.tomadorTipo === "PJ") recipientType = "company";
    else recipientType = "guest";
  } else if (!["guest", "company", "agency"].includes(recipientType)) {
    if (agencyOption && r?.channel === "b2b") recipientType = "agency";
    else if (companyOption && companyOption.tomadorCpfCnpj.length === 14 && isValidCnpj(companyOption.tomadorCpfCnpj)) recipientType = "company";
    else recipientType = "guest";
  }

  let activeOption =
    (recipientType === "agency" && agencyOption && agencyOption.tomadorCpfCnpj) ? { ...agencyOption } :
    (recipientType === "company" && companyOption && companyOption.tomadorCpfCnpj) ? { ...companyOption } :
    { ...guestOption };

  // Se houver dados já confirmados/personalizados em confirmedFiscalData ou invoiceDetails compatíveis com o tomador ativo, aplica por cima
  const customOverlay = confFiscal || invDetails || null;
  const ovDoc = onlyDigits(customOverlay?.tomadorCpfCnpj || "");
  const overlayMatchesActive = Boolean(
    customOverlay &&
    (!preferType || (preferType === "PF" && ovDoc.length === 11) || (preferType === "PJ" && ovDoc.length === 14)) &&
    (!ovDoc || ovDoc === activeOption.tomadorCpfCnpj || (ovDoc.length === 14 && activeOption.tomadorTipo === "PJ" && (companyOption || agencyOption)))
  );
  if (overlayMatchesActive) {
    if (ovDoc.length === 11 || ovDoc.length === 14) {
      activeOption.tomadorCpfCnpj = ovDoc;
      activeOption.doc = ovDoc;
      activeOption.tomadorTipo = ovDoc.length === 14 ? "PJ" : "PF";
    }
    if (customOverlay.tomadorNome) {
      activeOption.tomadorNome = customOverlay.tomadorNome;
      activeOption.name = customOverlay.tomadorNome;
    }
    if (customOverlay.tomadorEmail) activeOption.tomadorEmail = customOverlay.tomadorEmail;
    if (customOverlay.tomadorTelefone) activeOption.tomadorTelefone = onlyDigits(customOverlay.tomadorTelefone);
    if (customOverlay.tomadorEndereco) activeOption.tomadorEndereco = customOverlay.tomadorEndereco;
    if (customOverlay.tomadorNumero) activeOption.tomadorNumero = customOverlay.tomadorNumero;
    if (customOverlay.tomadorComplemento !== undefined) activeOption.tomadorComplemento = customOverlay.tomadorComplemento;
    if (customOverlay.tomadorBairro) activeOption.tomadorBairro = customOverlay.tomadorBairro;
    if (customOverlay.tomadorCidade) activeOption.tomadorCidade = customOverlay.tomadorCidade;
    if (customOverlay.tomadorUf) activeOption.tomadorUf = customOverlay.tomadorUf;
    if (customOverlay.tomadorCep) activeOption.tomadorCep = onlyDigits(customOverlay.tomadorCep);
    if (customOverlay.tomadorCodigoMunicipio) activeOption.tomadorCodigoMunicipio = customOverlay.tomadorCodigoMunicipio;
  }

  // Discriminação Oficial do Studio /notas:
  // 1) Se a reserva já possui descrição confirmada/editada (e não é o formato legado antigo), preserva;
  // 2) Se db.fiscalSettings.descriptionTemplate foi personalizado pelo gestor em /notas, aplica formatarDescricaoComTemplate;
  // 3) Caso contrário, usa buildStandardDescription (mesmo padrão da tela /notas).
  const sanitizeSavedServiceDescription = (desc = "") => {
    const s = String(desc || "").trim();
    if (!s) return s;
    const stdRegex = /(Nota\s+relativa\s+[àa]\s+hospedagem\s+(?:de|do|da|dos|das)\s+)([^\n.]+?)((?:,\s*no\s+Flat\s+[^\n.]+)?\.?)(?=\r?\n|$)/i;
    const stdMatch = s.match(stdRegex);
    if (!stdMatch) return s;
    const prefix = stdMatch[1];
    let currentNames = stdMatch[2].trim();
    let flatSuffix = stdMatch[3] || "";
    const innerFlatMatch = currentNames.match(/^(.+?)(,\s*no\s+Flat\s+.+)$/i);
    if (innerFlatMatch) {
      currentNames = innerFlatMatch[1].trim();
      flatSuffix = innerFlatMatch[2] + flatSuffix;
    }
    const parts = currentNames.split(/\s*(?:,|\be\b)\s*/i).map(p => p.trim()).filter(Boolean);
    const validParts = parts.filter(part => {
      const clean = part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").trim();
      if (!clean || clean.length < 2) return false;
      if (/[^\p{L}\s'.-]/u.test(clean)) return false;
      if (/\b(?:j[aá]|informei|mandei|enviei|falei|disse|escrevi|passei|coloquei|acima|cima|olha|conforme|antes|in[ií]cio|conversa|h[oó]spede|acompanhante|pessoa|descri[cç][aã]o|nota|fiscal|valor|emitir)\b/i.test(clean)) {
        return false;
      }
      return true;
    });
    if (validParts.length > 0 && validParts.length < parts.length) {
      const joined = validParts.length === 1
        ? validParts[0]
        : validParts.length === 2
          ? `${validParts[0]} e ${validParts[1]}`
          : `${validParts.slice(0, -1).join(", ")} e ${validParts[validParts.length - 1]}`;
      return s.replace(stdRegex, `${prefix}${joined}${flatSuffix}`);
    }
    return s;
  };

  if (confFiscal?.descricaoServico) {
    confFiscal.descricaoServico = sanitizeSavedServiceDescription(confFiscal.descricaoServico);
  }
  if (invDetails?.descricaoServico) {
    invDetails.descricaoServico = sanitizeSavedServiceDescription(invDetails.descricaoServico);
  }

  const hasCustomSavedDesc = Boolean(
    overlayMatchesActive &&
    confFiscal?.descricaoServico &&
    !String(confFiscal.descricaoServico).includes("Serviços de hospedagem com Wi-Fi e condomínio inclusos")
  );
  const customTemplate = db?.fiscalSettings?.descriptionTemplate;
  const isCustomTemplateModified = Boolean(
    customTemplate &&
    customTemplate.trim() !== "" &&
    customTemplate.trim() !== DEFAULT_FISCAL_TEMPLATE.trim()
  );

  let descricaoServico;
  if (hasCustomSavedDesc) {
    descricaoServico = confFiscal.descricaoServico;
  } else if (isCustomTemplateModified) {
    descricaoServico = formatarDescricaoComTemplate({
      tomadorNome: guestName,
      tomadorCpfCnpj: activeOption.tomadorCpfCnpj,
      localNome: "CorpFlats",
      localEndereco: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
      flatNumber,
      checkIn,
      checkOut,
      quantidadeDiarias: diarias,
      valorServico
    }, customTemplate);
  } else {
    descricaoServico = buildStandardDescription(guestName, flatNumber, checkIn, checkOut, diarias, extraIds);
  }

  return {
    reservationId: r?.id || null,
    reservationCode: r?.code || null,
    flatNumber,
    checkIn,
    checkOut,
    checkinDate: checkIn,
    checkoutDate: checkOut,
    quantidadeDiarias: diarias,
    diarias,
    valorOriginal,
    valorServico,
    descricaoServico,
    discriminacao: descricaoServico,
    discriminacaoSugerida: descricaoServico,
    invoiceRecipientType: recipientType,
    guestName,
    guestId: guestOption.guestId,
    companyId: companyOption?.companyId || null,
    agencyId: agencyOption?.agencyId || null,
    tomadorTipo: activeOption.tomadorTipo || (activeOption.tomadorCpfCnpj?.length === 14 ? "PJ" : "PF"),
    tomadorType: activeOption.tomadorType || (activeOption.tomadorCpfCnpj?.length === 14 ? "pj" : "pf"),
    tomadorPadrao: activeOption.tomadorPadrao || (activeOption.tomadorCpfCnpj?.length === 14 ? "PJ" : "PF"),
    tomadorNome: activeOption.tomadorNome,
    tomadorCpfCnpj: activeOption.tomadorCpfCnpj,
    tomadorEmail: activeOption.tomadorEmail,
    tomadorTelefone: activeOption.tomadorTelefone,
    tomadorEndereco: activeOption.tomadorEndereco,
    tomadorNumero: activeOption.tomadorNumero,
    tomadorComplemento: activeOption.tomadorComplemento || "",
    tomadorBairro: activeOption.tomadorBairro,
    tomadorCep: activeOption.tomadorCep,
    tomadorCidade: activeOption.tomadorCidade,
    tomadorUf: activeOption.tomadorUf,
    tomadorCodigoMunicipio: activeOption.tomadorCodigoMunicipio,
    tomadorOptions: {
      guest: guestOption,
      company: companyOption,
      agency: agencyOption,
      guestOption,
      companyOption,
      agencyOption
    }
  };
}

// ─── Motor de Template de Tags Dinâmicas ────────────────────────────────────
export const DEFAULT_FISCAL_TEMPLATE = `Nota relativa à hospedagem {artigo} {nome_hospede}{flat_info}.
Local: {local_nome}.
{local_endereco}
Quantidade de diárias: {diarias}
{checkin_info}
{checkout_info}`;

export function formatarDescricaoComTemplate(params, templateStr = DEFAULT_FISCAL_TEMPLATE) {
  const {
    tomadorNome = "Hóspede",
    tomadorCpfCnpj = "",
    localNome = "CorpFlats",
    localEndereco = "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
    flatNumber = "",
    checkIn = "",
    checkOut = "",
    quantidadeDiarias = 1,
    valorServico = "0.00"
  } = params;

  const cleanCheckIn = checkIn ? String(checkIn).substring(0, 10) : "";
  const cleanCheckOut = checkOut ? String(checkOut).substring(0, 10) : "";
  const artigo = "de";
  const flatInfo = flatNumber ? `, no Flat ${flatNumber}` : "";
  const checkinInfo = cleanCheckIn ? `Check-in: ${cleanCheckIn}` : "";
  const checkoutInfo = cleanCheckOut ? `Check-out: ${cleanCheckOut}` : "";
  const valorTotalFmt = Number(valorServico || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  let result = templateStr || DEFAULT_FISCAL_TEMPLATE;
  result = result.replace(/{nome_hospede}/g, tomadorNome || "Hóspede");
  result = result.replace(/{artigo}/g, artigo);
  result = result.replace(/{cpf_cnpj}/g, formatCpfCnpj(tomadorCpfCnpj));
  result = result.replace(/{flat}/g, flatNumber ? String(flatNumber) : "");
  result = result.replace(/{flat_info}/g, flatInfo);
  result = result.replace(/{local_nome}/g, localNome);
  result = result.replace(/{local_endereco}/g, localEndereco);
  result = result.replace(/{diarias}/g, `${quantidadeDiarias}`);
  result = result.replace(/{checkin}/g, cleanCheckIn);
  result = result.replace(/{checkout}/g, cleanCheckOut);
  result = result.replace(/{checkin_info}/g, checkinInfo);
  result = result.replace(/{checkout_info}/g, checkoutInfo);
  result = result.replace(/{valor_total}/g, valorTotalFmt);

  // Limpa linhas vazias decorrentes de tags opcionais ausentes
  return result.split("\n").filter(line => line.trim().length > 0).join("\n");
}

// ─── Conversor de Valores em Linguagem Natural ───────────────────────────────
function parseFlexibleMoney(text = "") {
  const clean = text.trim();

  // 1. Padrões monetários explícitos: R$ 250,00 | R$250 | 250,50 | 1.500,00 | 1500
  const m1 = clean.match(/(?:R\$|valor|total|de|diaria|custo|preco|preço)\s*:?\s*(?:R\$\s*)?([\d\.,]+)/i);
  if (m1) {
    const v = m1[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }

  // 2. Número acompanhado de "reais" ou "real" ou "conto": "250 reais", "300 conto"
  const m2 = clean.match(/([\d\.,]+)\s*(?:reais|real|conto|pila)/i);
  if (m2) {
    const v = m2[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }

  // 3. Mensagem é apenas um número puro: "250", "250.00", "250,00", "1500"
  const m3 = clean.match(/^\s*(?:R\$\s*)?(\d{1,6}(?:[\.,]\d{1,2})?)\s*$/i);
  if (m3) {
    const v = m3[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(v);
    if (!isNaN(num) && num > 0) return num.toFixed(2);
  }

  // 4. Números por extenso comuns
  const lower = clean.toLowerCase();
  const extensoMap = {
    "cem": "100.00", "cento e cinquenta": "150.00", "duzentos": "200.00",
    "duzentos e cinquenta": "250.00", "trezentos": "300.00", "trezentos e cinquenta": "350.00",
    "quatrocentos": "400.00", "quatrocentos e cinquenta": "450.00", "quinhentos": "500.00",
    "seiscentos": "600.00", "setecentos": "700.00", "oitocentos": "800.00",
    "novecentos": "900.00", "mil": "1000.00", "mil e quinhentos": "1500.00"
  };
  for (const [k, v] of Object.entries(extensoMap)) {
    if (lower.includes(k)) return v;
  }

  return null;
}

// ─── Motor de Processamento Conversacional Inteligente ───────────────────────
export async function processChatConversation({ 
  messages = [], 
  currentData = {}, 
  tomador = null, 
  tomadorFixo = null, 
  customTemplate = DEFAULT_FISCAL_TEMPLATE,
  onGuestDiscovered = null
}) {
  const baseData = currentData || tomador || tomadorFixo || {};

  const userMessages = messages.filter(m => m.role === "user").map(m => m.content.trim());
  const lastUserMessage = userMessages[userMessages.length - 1] || "";
  const fullConversationText = userMessages.join("\n");

  const data = {
    tomadorNome: baseData.tomadorNome || "",
    tomadorCpfCnpj: onlyDigits(baseData.tomadorCpfCnpj || ""),
    tomadorEmail: baseData.tomadorEmail || "",
    tomadorTelefone: onlyDigits(baseData.tomadorTelefone || ""),
    tomadorEndereco: baseData.tomadorEndereco || "",
    tomadorNumero: baseData.tomadorNumero || "",
    tomadorBairro: baseData.tomadorBairro || "",
    tomadorCidade: baseData.tomadorCidade || "Campos dos Goytacazes",
    tomadorCodigoMunicipio: baseData.tomadorCodigoMunicipio || "3301009",
    tomadorUf: baseData.tomadorUf || "RJ",
    tomadorCep: onlyDigits(baseData.tomadorCep || ""),
    valorServico: baseData.valorServico || "",
    checkIn: baseData.checkIn || new Date().toISOString().substring(0, 10),
    checkOut: baseData.checkOut || new Date(Date.now() + 86400000).toISOString().substring(0, 10),
    quantidadeDiarias: baseData.quantidadeDiarias || 1,
    flatNumber: baseData.flatNumber || "",
    descricaoServico: baseData.descricaoServico || ""
  };

  // Avalia todas as mensagens do histórico para extrair dados acumulados
  for (const text of [fullConversationText, lastUserMessage]) {
    // 1. Extração de CPF / CNPJ com validação Módulo 11
    const cnpjMatch = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/) || text.match(/\b\d{14}\b/);
    const cpfMatch = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/) || text.match(/\b\d{11}\b/);

    if (cnpjMatch) {
      const candidate = onlyDigits(cnpjMatch[0]);
      if (isValidCnpj(candidate)) {
        data.tomadorCpfCnpj = candidate;
        try {
          const cnpjInfo = await lookupCnpj(data.tomadorCpfCnpj);
          if (cnpjInfo.razaoSocial && !data.tomadorNome) data.tomadorNome = cnpjInfo.razaoSocial;
          if (cnpjInfo.nomeFantasia) data.tomadorNomeFantasia = cnpjInfo.nomeFantasia;
          if (cnpjInfo.logradouro) data.tomadorEndereco = cnpjInfo.logradouro;
          if (cnpjInfo.numero) data.tomadorNumero = cnpjInfo.numero;
          if (cnpjInfo.bairro) data.tomadorBairro = cnpjInfo.bairro;
          if (cnpjInfo.cep) data.tomadorCep = onlyDigits(cnpjInfo.cep);
          if (cnpjInfo.uf) data.tomadorUf = cnpjInfo.uf;
          if (cnpjInfo.codigoMunicipio) data.tomadorCodigoMunicipio = cnpjInfo.codigoMunicipio;
          if (cnpjInfo.email && !data.tomadorEmail) data.tomadorEmail = cnpjInfo.email;
          if (cnpjInfo.telefone && !data.tomadorTelefone) data.tomadorTelefone = onlyDigits(cnpjInfo.telefone);
        } catch {}
      } else {
        data.invalidDoc = candidate;
      }
    } else if (cpfMatch) {
      const candidate = onlyDigits(cpfMatch[0]);
      if (isValidCpf(candidate)) {
        data.tomadorCpfCnpj = candidate;
      } else {
        data.invalidDoc = candidate;
      }
    }

    // Extração de CEP avulso
    const cepMatch = text.match(/\b\d{5}-?\d{3}\b/) || text.match(/(?:cep)\s*:?\s*(\d{8}|\d{5}-\d{3})/i);
    if (cepMatch) {
      const candidateCep = onlyDigits(cepMatch[1] || cepMatch[0]);
      if (candidateCep.length === 8 && candidateCep !== data.tomadorCep) {
        try {
          const cepInfo = await lookupCep(candidateCep);
          data.tomadorCep = candidateCep;
          if (cepInfo.logradouro) data.tomadorEndereco = cepInfo.logradouro;
          if (cepInfo.bairro) data.tomadorBairro = cepInfo.bairro;
          if (cepInfo.uf) data.tomadorUf = cepInfo.uf;
          if (cepInfo.codigoMunicipio) data.tomadorCodigoMunicipio = cepInfo.codigoMunicipio;
        } catch {}
      }
    }

    // 2. Extração de Valor com o parser inteligente
    const extractedVal = parseFlexibleMoney(text);
    if (extractedVal) {
      data.valorServico = extractedVal;
    }

    // 3. Extração de Flat / Apartamento
    const flatMatch = text.match(/(?:flat|apto|apt|quarto|unidade)\s*:?\s*(\d{2,4})/i);
    if (flatMatch) {
      data.flatNumber = flatMatch[1];
    }

    // 4. Extração de Nome
    const nomeExplicitMatch = text.match(/(?:para|pra|pro|hospede|hóspede|nome|cliente|tomador|razao|razão)\s*:?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})/i);
    if (nomeExplicitMatch) {
      let cleanNome = nomeExplicitMatch[1].trim();
      cleanNome = cleanNome.replace(/\b(cpf|cnpj|flat|apto|apt|valor|r\$|de|diarias|diárias|reais)\b/gi, "").trim();
      if (cleanNome.length >= 3 && !/\d/.test(cleanNome)) {
        data.tomadorNome = cleanNome;
      }
    } else if (!data.tomadorNome && /^[A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40}$/.test(text.trim()) && !text.toLowerCase().includes("reais") && !text.toLowerCase().includes("diaria")) {
      data.tomadorNome = text.trim();
    }

    // 5. Extração de Diárias
    const diariasMatch = text.match(/(\d+)\s*(?:diarias|diárias|diaria|diária|noites|noite)/i);
    if (diariasMatch) {
      data.quantidadeDiarias = parseInt(diariasMatch[1], 10);
      const inDate = new Date(data.checkIn + "T12:00:00");
      const outDate = new Date(inDate.getTime() + (data.quantidadeDiarias * 86400000));
      data.checkOut = outDate.toISOString().substring(0, 10);
    }
  }

  // Se a última mensagem for exclusivamente um valor e ainda não tínhamos capturado
  if (!data.valorServico) {
    const lastVal = parseFlexibleMoney(lastUserMessage);
    if (lastVal) data.valorServico = lastVal;
  }

  // Permite enriquecer com o cadastro / check-in digital do hóspede antes de aplicar fallbacks
  if (typeof onGuestDiscovered === "function") {
    try {
      await onGuestDiscovered(data);
    } catch {}
  }

  // Fallbacks apenas se continuarem vazios após a busca no banco de hóspedes
  if (!data.tomadorEndereco) data.tomadorEndereco = "Av. Pelinca";
  if (!data.tomadorNumero) data.tomadorNumero = "100";
  if (!data.tomadorBairro) data.tomadorBairro = "Pelinca";
  if (!data.tomadorCep) data.tomadorCep = "28035000";

  // Atualiza descrição oficial usando o template dinâmico configurado
  data.descricaoServico = formatarDescricaoComTemplate({
    tomadorNome: data.tomadorNome || "Hóspede CorpFlats",
    tomadorCpfCnpj: data.tomadorCpfCnpj,
    localNome: "CorpFlats",
    localEndereco: "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes/RJ",
    flatNumber: data.flatNumber,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    quantidadeDiarias: data.quantidadeDiarias,
    valorServico: data.valorServico
  }, customTemplate);

  // Validação dos dados estritamente obrigatórios da nota
  const hasNome = Boolean(data.tomadorNome && data.tomadorNome.trim().length >= 2);
  const hasDoc = Boolean(data.tomadorCpfCnpj && (data.tomadorCpfCnpj.length === 11 || data.tomadorCpfCnpj.length === 14));
  const hasValor = Boolean(data.valorServico && parseFloat(data.valorServico) > 0);

  const ready = hasNome && hasDoc && hasValor;

  let reply = "";
  if (data.invalidDoc && !data.tomadorCpfCnpj) {
    reply = `⚠️ O documento informado (${data.invalidDoc}) contém dígitos verificadores inválidos pelo algoritmo da Receita Federal (Módulo 11). Por favor, confira o número e tente novamente.`;
  } else if (ready) {
    const formattedValor = Number(data.valorServico).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formattedDoc = formatCpfCnpj(data.tomadorCpfCnpj);
    const flatInfo = data.flatNumber ? ` • Flat ${data.flatNumber}` : "";

    reply = `✅ **Tudo pronto para emissão!**\n\n👤 **Tomador:** ${data.tomadorNome}\n📄 **Documento:** ${formattedDoc}\n💰 **Valor do Serviço:** ${formattedValor}${flatInfo}\n📅 **Estadia:** ${data.quantidadeDiarias} ${data.quantidadeDiarias === 1 ? 'diária' : 'diárias'}\n\nOs dados já foram preenchidos no painel lateral. É só clicar no botão **"Emitir NFS-e Agora"**!`;
  } else if (!hasNome && !hasDoc && !hasValor) {
    reply = `Pode me passar os dados da nota em linguagem livre. Por exemplo: *"Hospedagem para Miller Pessanha CPF 12585736792 valor 250 flat 113"*.`;
  } else if (!hasNome && !hasDoc) {
    reply = `Entendido! Por favor, informe o **Nome Completo** e o **CPF/CNPJ** do hóspede.`;
  } else if (!hasNome) {
    reply = `Documento registrado (${formatCpfCnpj(data.tomadorCpfCnpj)}). Qual é o **Nome Completo** ou Razão Social do tomador?`;
  } else if (!hasDoc) {
    reply = `Nome registrado (${data.tomadorNome}). Qual é o **CPF** (11 dígitos) ou **CNPJ** (14 dígitos)?`;
  } else if (!hasValor) {
    reply = `Excelente! Qual é o **Valor Total** da hospedagem em reais? (Ex: 250 ou 250,00)`;
  }

  return {
    reply,
    ready,
    data
  };
}
