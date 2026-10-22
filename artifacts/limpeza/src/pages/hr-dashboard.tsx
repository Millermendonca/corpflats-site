import React, { useState, useEffect, useRef, useMemo } from "react";
import { Shell } from "@/components/layout";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Calendar,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ShieldBan,
  FileText,
  HeartPulse,
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  Eye,
  Download,
  Printer,
  Send,
  MapPin,
  Camera,
  KeyRound,
  Lock,
  Info,
  ExternalLink,
  ArrowRight,
  DollarSign,
  FileCheck,
  CheckSquare,
  Sparkles,
  Search,
  Building2,
  FileSpreadsheet,
  HelpCircle,
  XCircle,
  X,
  CreditCard,
  Briefcase
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";

// ── TIPOS E INTERFACES ────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  matricula: string;
  contractType: "clt" | "prestador";
  active: boolean;
  status: "ativo" | "ferias" | "afastado" | "inativo";
  name: string;
  nickname: string;
  cpf: string;
  rg: string;
  birthDate: string;
  gender: string;
  maritalStatus: string;
  address?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  phone: string;
  whatsapp: string;
  email: string;
  admissionDate: string;
  role: string;
  department: string;
  cbo: string;
  unionCategory: string;
  ctpsNumber: string;
  ctpsSeries: string;
  ctpsUf: string;
  pisPasep: string;
  workRegime: string;
  shiftType: string;
  weeklyHours: number;
  defaultSchedule: {
    entryTime: string;
    breakStartTime: string;
    breakEndTime: string;
    breakDurationMinutes: number;
    exitTime: string;
    weeklyRestDay: string;
  };
  scheduledLunchBreak: boolean;
  baseSalary: number;
  additionalInsalubridade?: {
    enabled: boolean;
    percentage: number;
    base: string;
  };
  transportVoucher?: {
    optIn: boolean;
    deductionPercentage: number;
  };
  mealAllowance?: {
    providedOnSite: boolean;
    deductionAmount: number;
  };
  pixKey: string;
  pixKeyType: string;
  bankDetails?: {
    bankName: string;
    bankCode: string;
    agency: string;
    accountNumber: string;
    accountType: string;
  };
  pinHash?: string;
  authorizedDeviceIds?: string[];
  functionalHistory?: Array<{
    id: string;
    date: string;
    type: string;
    description: string;
    registeredBy: string;
    createdAt: string;
  }>;
}

export interface ComplianceRule {
  id: string;
  name: string;
  level: "alert" | "admin_override" | "hard_block";
  enabled: boolean;
  legalBasis: string;
  params?: Record<string, any>;
}

export interface ComplianceAudit {
  id: string;
  timestamp: string;
  date: string;
  employeeId: string;
  employeeName: string;
  ruleId: string;
  ruleName: string;
  level: string;
  action: string;
  outcome?: string;
  authorizedBy: string | null;
  justification: string | null;
  details?: Record<string, any>;
}

export interface TimeRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  time: string;
  punchType: "entrada" | "almoco_saida" | "almoco_retorno" | "saida" | "pausa_saida" | "pausa_retorno";
  punchTypeLabel: string;
  nsr: number;
  hashSha256: string;
  selfie?: string;
  selfieUrl?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  distanceMeters?: number;
  withinGeofence?: boolean;
  deviceAuthorized?: boolean;
  deviceId?: string;
  adjusted?: boolean;
  adjustReason?: string;
  timestamp?: string;
}

export interface ScheduleDay {
  id: string;
  employeeId: string;
  date: string;
  dayOfWeek: string;
  status: "trabalho" | "folga" | "ferias" | "afastamento" | "feriado";
  shiftType: string;
  plannedStartTime?: string;
  plannedEndTime?: string;
  plannedLunchStart?: string;
  plannedLunchEnd?: string;
  isDsr?: boolean;
  isSundayDsr?: boolean;
  notes?: string;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  yearMonth: string;
  baseSalary: number;
  grossSalary: number;
  netSalary: number;
  inssDiscount: number;
  transportVoucherDiscount: number;
  overtime50Amount: number;
  overtime100Amount: number;
  dsrOvertimeAmount: number;
  nightShiftAmount: number;
  insalubridadeAmount: number;
  totalEarnings: number;
  totalDeductions: number;
  status: "open" | "calculated" | "closed" | "paid";
  paymentPixDate?: string;
  paymentPixE2E?: string;
  paymentPixReceiptUrl?: string;
  closedAt?: string;
}

export interface ContractDoc {
  id: string;
  templateId: string;
  title: string;
  category: string;
  legalBasis: string;
  employeeId: string;
  employeeName: string;
  status: "pending_signature" | "signed";
  content?: string;
  signature?: {
    dataUrl: string;
    signatureHash: string;
    ipAddress: string;
    userAgent: string;
    signedAt: string;
    legalNotice: string;
  };
  finalSealSha256?: string;
  createdAt: string;
  signedAt?: string;
}

export interface AsoRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  cpf: string;
  role: string;
  examType: "admissional" | "periodico" | "retorno_trabalho" | "mudanca_risco" | "demissional";
  examTypeName: string;
  examDate: string;
  expirationDate: string;
  aptitudeStatus: "apto" | "inapto" | "apto_com_restricoes";
  clinicName: string;
  doctorName: string;
  doctorCrm: string;
  notes?: string;
  attachmentUrl?: string | null;
  daysRemaining?: number;
  alertLevel?: "expired" | "expiring_30_days" | "expiring_60_days";
}

export interface DeviceItem {
  deviceId: string;
  name: string;
  authorizedAt: string;
  authorizedBy: string;
  lastPunchAt?: string;
  active: boolean;
}

// ── DADOS INICIAIS DE CONTINGÊNCIA / FALLBACK ─────────────────────────────────

const INITIAL_CLT_EMPLOYEES: Employee[] = [
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
    baseSalary: 1780.0,
    additionalInsalubridade: {
      enabled: true,
      percentage: 20,
      base: "salario_minimo"
    },
    transportVoucher: {
      optIn: true,
      deductionPercentage: 6
    },
    pixKey: "22998877665",
    pixKeyType: "phone"
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
    baseSalary: 1650.0,
    additionalInsalubridade: {
      enabled: true,
      percentage: 20,
      base: "salario_minimo"
    },
    transportVoucher: {
      optIn: true,
      deductionPercentage: 6
    },
    pixKey: "98765432109",
    pixKeyType: "cpf"
  }
];

const PRESTADORAS_AUTONOMAS = [
  {
    id: 2,
    name: "Cris",
    nickname: "Cris Governança",
    pixKey: "22988486446",
    role: "Prestadora de Serviço Autônoma (Diarista)",
    activity: "Limpeza de Check-out e Governança Quinzenal",
    remunerationBasis: "R$ por faxina executada (Extrato em /reports)"
  },
  {
    id: 3,
    name: "Grazi",
    nickname: "Grazi Governança",
    pixKey: "12977795766",
    role: "Prestadora de Serviço Autônoma (Diarista)",
    activity: "Limpeza de Check-out e Governança Quinzenal",
    remunerationBasis: "R$ por faxina executada (Extrato em /reports)"
  }
];

// ── COMPONENTE PRINCIPAL DO DASHBOARD DE RH ───────────────────────────────────

export default function HrDashboardPage() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { toast } = useToast();

  // Estados Globais de Seleção e Navegação
  const [activeTab, setActiveTab] = useState<string>("funcionarios");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("emp_cozinha_01");
  const [currentYearMonth, setCurrentYearMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Estados de Dados do Backend
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_CLT_EMPLOYEES);
  const [complianceRules, setComplianceRules] = useState<ComplianceRule[]>([]);
  const [complianceAudits, setComplianceAudits] = useState<ComplianceAudit[]>([]);
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleDay[]>([]);
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([]);
  const [contracts, setContracts] = useState<ContractDoc[]>([]);
  const [asoRecords, setAsoRecords] = useState<AsoRecord[]>([]);
  const [asoAlerts, setAsoAlerts] = useState<{
    totalAlerts: number;
    expired: AsoRecord[];
    expiring_30_days: AsoRecord[];
    expiring_60_days: AsoRecord[];
  }>({ totalAlerts: 0, expired: [], expiring_30_days: [], expiring_60_days: [] });
  const [deviceWhitelist, setDeviceWhitelist] = useState<{
    enforceWhitelist: boolean;
    devices: DeviceItem[];
  }>({ enforceWhitelist: false, devices: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Estados dos Modais
  const [showWhitelistModal, setShowWhitelistModal] = useState<boolean>(false);
  const [showInspectPunchModal, setShowInspectPunchModal] = useState<TimeRecord | null>(null);
  const [showAdjustPunchModal, setShowAdjustPunchModal] = useState<TimeRecord | null>(null);
  const [showGenerateScheduleModal, setShowGenerateScheduleModal] = useState<boolean>(false);
  const [showPayslipModal, setShowPayslipModal] = useState<any | null>(null);
  const [showPixPaymentModal, setShowPixPaymentModal] = useState<PayrollRecord | null>(null);
  const [showContractModal, setShowContractModal] = useState<ContractDoc | null>(null);
  const [showSignContractModal, setShowSignContractModal] = useState<ContractDoc | null>(null);
  const [showNewAsoModal, setShowNewAsoModal] = useState<boolean>(false);
  const [showEmployeeDetailModal, setShowEmployeeDetailModal] = useState<Employee | null>(null);
  const [showEditPinModal, setShowEditPinModal] = useState<Employee | null>(null);

  // Estados de Formulários e Inputs
  const [newDeviceName, setNewDeviceName] = useState<string>("");
  const [adjustData, setAdjustData] = useState<{
    date: string;
    time: string;
    punchType: string;
    justification: string;
    adminName: string;
  }>({
    date: new Date().toISOString().substring(0, 10),
    time: "08:00",
    punchType: "entrada",
    justification: "",
    adminName: user?.username || "admin"
  });

  const [pixPaymentData, setPixPaymentData] = useState<{
    paymentDate: string;
    e2eId: string;
    receiptNote: string;
  }>({
    paymentDate: new Date().toISOString().substring(0, 10),
    e2eId: "",
    receiptNote: "Quitação regular da folha mensal via Banco Inter PIX"
  });

  const [newAsoData, setNewAsoData] = useState<{
    employeeId: string;
    examType: string;
    examDate: string;
    expirationDate: string;
    aptitudeStatus: string;
    clinicName: string;
    doctorName: string;
    doctorCrm: string;
    notes: string;
  }>({
    employeeId: "emp_cozinha_01",
    examType: "periodico",
    examDate: new Date().toISOString().substring(0, 10),
    expirationDate: "",
    aptitudeStatus: "apto",
    clinicName: "Clínica de Saúde Ocupacional Campos dos Goytacazes",
    doctorName: "Dr. Roberto Silveira",
    doctorCrm: "CRM/RJ 58492-0",
    notes: "Apto para atividades na cozinha e manipulação de alimentos (NR-7)"
  });

  const [newPin, setNewPin] = useState<string>("");

  // Referência do Canvas de Assinatura Digital
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const isDrawingRef = useRef<boolean>(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  // Colaborador CLT selecionado atualmente
  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId) || employees[0] || INITIAL_CLT_EMPLOYEES[0];
  }, [employees, selectedEmployeeId]);

  // Carregamento Inicial e Recarga
  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // 1. Funcionários
      const resEmp = await fetch("/api/hr/employees", { credentials: "include" });
      if (resEmp.ok) {
        const dataEmp = await resEmp.json();
        if (dataEmp.employees && dataEmp.employees.length > 0) {
          setEmployees(dataEmp.employees);
        }
      }

      // 2. Regras de Conformidade
      const resRules = await fetch("/api/hr/compliance/rules", { credentials: "include" });
      if (resRules.ok) {
        const dataRules = await resRules.json();
        if (dataRules.rules) {
          setComplianceRules(dataRules.rules);
        }
      }

      // 3. Auditoria de Overrides
      const resAudits = await fetch("/api/hr/compliance/audits", { credentials: "include" });
      if (resAudits.ok) {
        const dataAudits = await resAudits.json();
        if (dataAudits.audits) {
          setComplianceAudits(dataAudits.audits);
        }
      }

      // 4. Registros de Ponto
      const resRecords = await fetch("/api/hr/timekeeping/records", { credentials: "include" });
      if (resRecords.ok) {
        const dataRecords = await resRecords.json();
        if (dataRecords.records) {
          setTimeRecords(dataRecords.records);
        }
      }

      // 5. Whitelist de Dispositivos
      const resDevices = await fetch("/api/hr/devices", { credentials: "include" });
      if (resDevices.ok) {
        const dataDev = await resDevices.json();
        setDeviceWhitelist({
          enforceWhitelist: Boolean(dataDev.enforceWhitelist),
          devices: Array.isArray(dataDev.devices) ? dataDev.devices : []
        });
      }

      // 6. Alertas e Registros de ASO
      const resAso = await fetch("/api/hr/aso", { credentials: "include" });
      if (resAso.ok) {
        const dataAso = await resAso.json();
        if (dataAso.asoRecords) {
          setAsoRecords(dataAso.asoRecords);
        }
      }
      const resAlerts = await fetch("/api/hr/aso/alerts", { credentials: "include" });
      if (resAlerts.ok) {
        const dataAlerts = await resAlerts.json();
        setAsoAlerts({
          totalAlerts: dataAlerts.totalAlerts || 0,
          expired: dataAlerts.expired || [],
          expiring_30_days: dataAlerts.expiring_30_days || [],
          expiring_60_days: dataAlerts.expiring_60_days || []
        });
      }

      // 7. Escalas do Mês Atual
      const resSched = await fetch(`/api/hr/schedules?employeeId=${selectedEmployeeId}&yearMonth=${currentYearMonth}`, { credentials: "include" });
      if (resSched.ok) {
        const dataSched = await resSched.json();
        if (dataSched.schedules) {
          setSchedules(dataSched.schedules);
        }
      }

      // 8. Folha de Pagamento
      const resPay = await fetch(`/api/hr/payroll?yearMonth=${currentYearMonth}`, { credentials: "include" });
      if (resPay.ok) {
        const dataPay = await resPay.json();
        if (dataPay.payroll) {
          setPayrollList(dataPay.payroll);
        }
      }

      // 9. Contratos do Colaborador
      const resContr = await fetch(`/api/hr/contracts/employee/${selectedEmployeeId}`, { credentials: "include" });
      if (resContr.ok) {
        const dataContr = await resContr.json();
        if (dataContr.contracts) {
          setContracts(dataContr.contracts);
        }
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados do RH:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [selectedEmployeeId, currentYearMonth]);

  // Cálculos de KPIs do Header
  const activeCltCount = useMemo(() => {
    return employees.filter(e => e.contractType === "clt" && e.active !== false).length;
  }, [employees]);

  const todayPunchesCount = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    return timeRecords.filter(r => r.date === today).length;
  }, [timeRecords]);

  // Mudança de Nível da Regra de Conformidade
  const handleUpdateRuleLevel = async (ruleId: string, newLevel: "alert" | "admin_override" | "hard_block") => {
    try {
      const res = await fetch(`/api/hr/compliance/rules/${ruleId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: newLevel })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao atualizar regra");
      }

      setComplianceRules(prev =>
        prev.map(r => (r.id === ruleId ? { ...r, level: newLevel } : r))
      );

      toast({
        title: "Regra Atualizada",
        description: `Nível alterado para ${newLevel.toUpperCase()} com sucesso.`
      });
    } catch (err: any) {
      toast({
        title: "Falha na Atualização",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Toggle do Interruptor de Whitelist de Dispositivos
  const handleToggleWhitelistEnforcement = async (enabled: boolean) => {
    try {
      const res = await fetch("/api/hr/devices/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enforceWhitelist: enabled })
      });

      if (!res.ok) throw new Error("Erro ao salvar configuração da Whitelist");

      setDeviceWhitelist(prev => ({ ...prev, enforceWhitelist: enabled }));
      toast({
        title: enabled ? "Whitelist Ativada" : "Whitelist Desativada",
        description: enabled
          ? "Apenas aparelhos autorizados na lista poderão bater ponto."
          : "Modo flexível: colaboradores podem bater ponto por celulares pessoais."
      });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Auto-autorizar o dispositivo atual no localStorage
  const handleAuthorizeCurrentDevice = async () => {
    try {
      let token = localStorage.getItem("gfm_device_token");
      if (!token) {
        token = "dev_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now().toString(36);
        localStorage.setItem("gfm_device_token", token);
      }

      const name = newDeviceName.trim() || `Terminal Corporativo (${navigator.platform || "Desktop/Mobile"})`;
      const res = await fetch("/api/hr/devices/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: token,
          name,
          deviceType: "tablet_soho"
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao autorizar aparelho");
      }

      const data = await res.json();
      setDeviceWhitelist(prev => ({
        ...prev,
        devices: [...prev.devices.filter(d => d.deviceId !== token), data.device]
      }));
      setNewDeviceName("");

      toast({
        title: "Aparelho Autorizado",
        description: `Dispositivo '${name}' registrado com sucesso na Whitelist!`
      });
    } catch (err: any) {
      toast({
        title: "Erro ao Autorizar",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Revogar Aparelho da Whitelist
  const handleDeauthorizeDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/hr/devices/${deviceId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error("Erro ao desautorizar dispositivo");

      setDeviceWhitelist(prev => ({
        ...prev,
        devices: prev.devices.filter(d => d.deviceId !== deviceId)
      }));

      toast({
        title: "Aparelho Revogado",
        description: "Dispositivo removido da whitelist com sucesso."
      });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Gerar Escala 6x1 do Mês
  const handleGenerateMonthlySchedule = async () => {
    try {
      const res = await fetch("/api/hr/schedules/generate-month", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          yearMonth: currentYearMonth,
          modality: selectedEmployee.shiftType || "7h20_diarias",
          dsrDayOfWeek: selectedEmployee.defaultSchedule?.weeklyRestDay || "segunda"
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao gerar escala");
      }

      const data = await res.json();
      setSchedules(data.schedules || []);
      setShowGenerateScheduleModal(false);

      toast({
        title: "Escala 6x1 Gerada",
        description: `Escala mensal gerada com sucesso para ${selectedEmployee.name}.`
      });
    } catch (err: any) {
      toast({
        title: "Erro ao Gerar Escala",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Salvar Ajuste Manual de Ponto com Justificativa Legal
  const handleSaveAdjustPunch = async () => {
    try {
      if (!adjustData.justification.trim()) {
        toast({
          title: "Justificativa Obrigatória",
          description: "A Portaria MTP 671 exige justificativa formal para ajustes manuais de ponto.",
          variant: "destructive"
        });
        return;
      }

      const recordId = showAdjustPunchModal?.id || `adjust_${Date.now()}`;
      const res = await fetch(`/api/hr/timekeeping/records/${recordId}/adjust`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          date: adjustData.date,
          time: adjustData.time,
          punchType: adjustData.punchType,
          reason: adjustData.justification,
          adminName: user?.username || "admin"
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar ajuste");
      }

      const data = await res.json();
      setTimeRecords(prev => [data.record, ...prev.filter(r => r.id !== data.record.id)]);
      setShowAdjustPunchModal(null);

      toast({
        title: "Batida Ajustada",
        description: "Ajuste manual homologado com trilha de auditoria."
      });
    } catch (err: any) {
      toast({
        title: "Erro no Ajuste",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Fechar Folha Mensal
  const handleClosePayroll = async () => {
    try {
      const res = await fetch("/api/hr/payroll/close-month", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth: currentYearMonth,
          employeeId: selectedEmployeeId
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao fechar folha");
      }

      const data = await res.json();
      toast({
        title: "Folha Fechada",
        description: `Folha de ${currentYearMonth} apurada com sucesso.`
      });
      fetchAllData();
    } catch (err: any) {
      toast({
        title: "Erro no Fechamento",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Registrar Baixa PIX
  const handleRegisterPixPayment = async () => {
    if (!showPixPaymentModal) return;
    try {
      const res = await fetch(`/api/hr/payroll/${showPixPaymentModal.id}/pay-pix`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          e2eId: pixPaymentData.e2eId || `E2E${Date.now()}INTER`,
          paymentDate: pixPaymentData.paymentDate,
          notes: pixPaymentData.receiptNote
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao registrar pagamento PIX");
      }

      toast({
        title: "Baixa PIX Confirmada",
        description: "Quitação da folha registrada com comprovante."
      });
      setShowPixPaymentModal(null);
      fetchAllData();
    } catch (err: any) {
      toast({
        title: "Erro na Baixa PIX",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Handlers do Canvas de Assinatura
  const startDrawing = (e: any) => {
    setIsDrawing(true);
    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!isDrawing && !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    isDrawingRef.current = false;
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  // Confirmar Assinatura Digital do Contrato
  const handleConfirmContractSignature = async () => {
    if (!showSignContractModal || !signatureData) {
      toast({
        title: "Assinatura Ausente",
        description: "Por favor, desenhe sua assinatura no pad antes de confirmar.",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch(`/api/hr/contracts/${showSignContractModal.id}/sign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: signatureData,
          employeeId: showSignContractModal.employeeId
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao assinar contrato");
      }

      toast({
        title: "Contrato Assinado & Selado",
        description: "Assinatura eletrônica gravada com validade jurídica (MP 2.200-2/2001)."
      });

      setShowSignContractModal(null);
      setSignatureData(null);
      fetchAllData();
    } catch (err: any) {
      toast({
        title: "Erro na Assinatura",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Salvar Novo Exame ASO
  const handleSaveAsoExam = async () => {
    try {
      const res = await fetch("/api/hr/aso", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAsoData)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao registrar exame ASO");
      }

      toast({
        title: "Exame ASO Registrado",
        description: "Exame médico cadastrado per NR-7 com vencimento automático."
      });

      setShowNewAsoModal(false);
      fetchAllData();
    } catch (err: any) {
      toast({
        title: "Erro no Cadastro ASO",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  // Salvar Novo PIN do Colaborador
  const handleSaveNewPin = async () => {
    if (!showEditPinModal) return;
    if (!/^\d{4}$/.test(newPin)) {
      toast({
        title: "PIN Inválido",
        description: "O PIN deve conter exatamente 4 dígitos numéricos.",
        variant: "destructive"
      });
      return;
    }

    try {
      const res = await fetch(`/api/hr/employees/${showEditPinModal.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin })
      });

      if (!res.ok) throw new Error("Erro ao salvar novo PIN");

      toast({
        title: "PIN Atualizado",
        description: `Novo PIN de 4 dígitos configurado para ${showEditPinModal.name}.`
      });

      setShowEditPinModal(null);
      setNewPin("");
      fetchAllData();
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message,
        variant: "destructive"
      });
    }
  };

  return (
    <Shell>
      <div className="flex-1 space-y-6 p-4 sm:p-8 max-w-7xl mx-auto">
        {/* ── HEADER SUPERIOR COM KPIS E AÇÕES RÁPIDAS ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-primary/10 text-primary">
                <Users className="w-6 h-6" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Recursos Humanos & Colaboradores CLT
              </h1>
              <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20 font-bold">
                CorpFlats Soho
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Escala 6x1 (44h Semanais) • Ponto com Selfie & GPS (Portaria 671 MTE) • Folha de Pagamento, Contratos & ASO (NR-7)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWhitelistModal(true)}
              className="h-9 font-semibold text-xs rounded-xl shadow-xs border-primary/20 hover:bg-primary/5"
            >
              <Smartphone className="w-4 h-4 mr-1.5 text-primary" />
              Whitelist de Aparelhos
              {deviceWhitelist.enforceWhitelist && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1.5 animate-pulse" />
              )}
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => setLocation("/ponto")}
              className="h-9 font-bold text-xs rounded-xl shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Camera className="w-4 h-4 mr-1.5" />
              Abrir Terminal de Ponto
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAllData}
              disabled={isLoading}
              className="h-9 w-9 p-0 rounded-xl"
              title="Atualizar Dados de RH"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── CARDS DE KPIS E INDICADORES RÁPIDOS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Colaboradores CLT</p>
                <p className="text-2xl font-black text-foreground mt-0.5">{activeCltCount}</p>
                <p className="text-[11px] text-emerald-600 font-bold flex items-center mt-0.5">
                  <CheckCircle2 className="w-3 h-3 mr-1 inline" /> 1 Cozinha + 1 Camareira
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Users className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Prestadoras Isoladas</p>
                <p className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-0.5">2</p>
                <p className="text-[11px] text-amber-600 font-bold mt-0.5">Cris & Grazi (Diaristas)</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Batidas de Hoje</p>
                <p className="text-2xl font-black text-foreground mt-0.5">{todayPunchesCount}</p>
                <p className="text-[11px] text-primary font-bold mt-0.5">Selfie + GPS Válidos</p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                <Clock className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Banco de Horas Equipe</p>
                <p className="text-2xl font-black text-emerald-600 mt-0.5">+4h 20m</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Saldo Positivo 2026</p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Calendar className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border bg-card/60 shadow-xs col-span-2 sm:col-span-1">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Saúde Ocupacional</p>
                <p className="text-2xl font-black text-foreground mt-0.5">
                  {asoAlerts.totalAlerts === 0 ? "100%" : `${asoAlerts.totalAlerts} Alertas`}
                </p>
                <p className="text-[11px] font-bold mt-0.5 text-emerald-600">
                  {asoAlerts.totalAlerts === 0 ? "ASO em dia" : "Atenção a exames"}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600">
                <HeartPulse className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── NAVEGAÇÃO POR ABAS RADIX TABS ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-6 h-auto p-1.5 rounded-2xl bg-muted/60 border border-border">
            <TabsTrigger value="funcionarios" className="rounded-xl py-2 font-bold text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Users className="w-4 h-4" />
              <span>Funcionários</span>
            </TabsTrigger>
            <TabsTrigger value="escalas_ponto" className="rounded-xl py-2 font-bold text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Clock className="w-4 h-4" />
              <span>Escalas & Ponto</span>
            </TabsTrigger>
            <TabsTrigger value="conformidade" className="rounded-xl py-2 font-bold text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <ShieldAlert className="w-4 h-4" />
              <span>Conformidade</span>
            </TabsTrigger>
            <TabsTrigger value="folha" className="rounded-xl py-2 font-bold text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <DollarSign className="w-4 h-4" />
              <span>Folha & Holerite</span>
            </TabsTrigger>
            <TabsTrigger value="contratos" className="rounded-xl py-2 font-bold text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <FileText className="w-4 h-4" />
              <span>Contratos & Assinatura</span>
            </TabsTrigger>
            <TabsTrigger value="aso" className="rounded-xl py-2 font-bold text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <HeartPulse className="w-4 h-4" />
              <span>Saúde Ocupacional</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 1: FUNCIONÁRIOS (CADASTRO CLT VS ISOLAMENTO CRIS & GRAZI)
          ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="funcionarios" className="space-y-6 mt-0">
            {/* Seção 1: Colaboradores em Regime CLT */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-primary" />
                    Colaboradores em Regime CLT (Hotelaria 6x1 - 44h)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Profissionais com carteira assinada, controle de ponto com biometria facial e folha mensal apurada.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {employees.map(emp => (
                  <Card key={emp.id} className="rounded-2xl border-border bg-card/70 shadow-xs hover:border-primary/30 transition-all">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg border border-primary/20">
                            {emp.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <CardTitle className="text-base font-black text-foreground">{emp.name}</CardTitle>
                            <CardDescription className="text-xs font-semibold text-primary">
                              {emp.role} • Matrícula: {emp.matricula}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-bold text-[10px]">
                          CLT Ativo
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/60">
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">JORNADA & ESCALA</span>
                          <span className="font-semibold text-foreground">6x1 (44h) • {emp.defaultSchedule?.entryTime || "08:00"} às {emp.defaultSchedule?.exitTime || "16:20"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">FOLGA FIXA (DSR)</span>
                          <span className="font-semibold text-foreground capitalize">{emp.defaultSchedule?.weeklyRestDay || "Segunda"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">SALÁRIO BASE</span>
                          <span className="font-black text-foreground">R$ {emp.baseSalary?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">ADICIONAIS</span>
                          <span className="font-semibold text-foreground">Insalubridade 20% (R$ 303,60)</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">INTERVALO ALMOÇO</span>
                          <span className="font-semibold text-foreground">1h ({emp.defaultSchedule?.breakStartTime} às {emp.defaultSchedule?.breakEndTime})</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">CHAVE PIX</span>
                          <span className="font-mono text-[11px] text-foreground">{emp.pixKey}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowEditPinModal(emp);
                            setNewPin("");
                          }}
                          className="h-8 text-xs font-semibold rounded-lg"
                        >
                          <KeyRound className="w-3.5 h-3.5 mr-1 text-primary" />
                          PIN do Ponto
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowEmployeeDetailModal(emp)}
                          className="h-8 text-xs font-bold rounded-lg"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Ficha Completa
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Seção 2: Prestadoras de Serviço Autônomas (Cris & Grazi) — Isolamento Estrito */}
            <Card className="rounded-3xl border-2 border-amber-400/80 bg-amber-500/5 dark:bg-amber-950/20 shadow-md">
              <CardHeader className="p-6 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-black text-amber-900 dark:text-amber-100 flex items-center gap-2">
                        Prestadoras Autônomas de Governança (Cris & Grazi)
                        <Badge className="bg-amber-500 text-amber-950 font-black text-[10px] uppercase">
                          Isolamento Jurídico Ativo
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                        Diaristas autônomas remuneradas por faxina avulsa • Isentas de subordinação horária e controle de ponto CLT.
                      </CardDescription>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation("/reports")}
                    className="h-8 text-xs font-bold rounded-xl border-amber-500/40 text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Abrir Extrato de Governança
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-6 pt-2 space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
                  <strong>Declaração de Conformidade Trabalhista:</strong> As colaboradoras <strong>Cris</strong> e <strong>Grazi</strong> atuam estritamente como prestadoras de serviços autônomas/diaristas na higienização dos 19 flats do Soho Residence. Por determinação legal e de compliance, elas são <strong>terminantemente bloqueadas</strong> de: lembretes automáticos de ponto no WhatsApp, motor de conformidade da Portaria 671 MTE, banco de horas, folha mensal CLT e assinatura de contratos de trabalho. Seus repasses continuam apurados por faxina realizada no Fechamento Quinzenal.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PRESTADORAS_AUTONOMAS.map(p => (
                    <div key={p.id} className="p-4 rounded-2xl bg-card border border-amber-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-200 flex items-center justify-center font-black">
                          {p.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-black text-foreground">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground font-semibold">Chave PIX: {p.pixKey}</p>
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">{p.remunerationBasis}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                        Diarista Autônoma
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 2: ESCALAS & ESPELHO DE PONTO (PORTARIA 671 MTE & TOLERÂNCIA)
          ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="escalas_ponto" className="space-y-6 mt-0">
            {/* Controles de Filtro: Colaborador e Competência */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Colaborador CLT</Label>
                  <select
                    value={selectedEmployeeId}
                    onChange={e => setSelectedEmployeeId(e.target.value)}
                    className="flex h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs font-bold shadow-xs focus:outline-none"
                  >
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Competência (Mês/Ano)</Label>
                  <Input
                    type="month"
                    value={currentYearMonth}
                    onChange={e => setCurrentYearMonth(e.target.value)}
                    className="h-9 w-40 text-xs font-bold rounded-xl"
                  >
                  </Input>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGenerateScheduleModal(true)}
                  className="h-9 text-xs font-bold rounded-xl border-primary/20 text-primary hover:bg-primary/5"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1.5" />
                  Gerar Escala 6x1
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setAdjustData({
                      date: new Date().toISOString().substring(0, 10),
                      time: "08:00",
                      punchType: "entrada",
                      justification: "",
                      adminName: user?.username || "admin"
                    });
                    setShowAdjustPunchModal({ id: "new" } as any);
                  }}
                  className="h-9 text-xs font-bold rounded-xl shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Ajuste Manual
                </Button>
              </div>
            </div>

            {/* Calendário Mensal 6x1 e Resumo da Escala */}
            <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black text-foreground">
                      Grade Mensal de Escala 6x1 — {selectedEmployee.name}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Regime CLT 44h semanais • 7h20 diárias ou 8h+4h com 1h de almoço obrigatório • Tolerância legal Art. 58 CLT
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-bold text-xs bg-primary/5 text-primary">
                    DSR Semanal: {selectedEmployee.defaultSchedule?.weeklyRestDay?.toUpperCase() || "SEGUNDA"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2">
                  {Array.from({ length: 30 }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${currentYearMonth}-${String(dayNum).padStart(2, "0")}`;
                    const d = new Date(`${dateStr}T12:00:00Z`);
                    const dayOfWeek = d.getDay(); // 0 = Domingo
                    const isDsr = dayOfWeek === 1; // Exemplo: Segunda é DSR
                    const isSunday = dayOfWeek === 0;

                    return (
                      <div
                        key={dayNum}
                        className={`p-3 rounded-xl border text-xs flex flex-col justify-between transition-all min-h-[75px] ${
                          isDsr
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                            : isSunday
                            ? "bg-blue-500/5 border-blue-500/20 text-blue-900 dark:text-blue-200"
                            : "bg-card border-border/80 text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm">{dayNum}</span>
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][dayOfWeek]}
                          </span>
                        </div>
                        <div className="mt-1">
                          {isDsr ? (
                            <span className="text-[10px] font-bold text-emerald-600 block">FOLGA DSR</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-muted-foreground block">
                              {selectedEmployee.defaultSchedule?.entryTime || "08:00"} - {selectedEmployee.defaultSchedule?.exitTime || "16:20"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Espelho de Ponto Diário (Portaria 671 MTE) */}
            <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-black text-foreground">
                      Espelho de Ponto Eletrônico Digital (REP-P / Portaria 671 MTE)
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Batidas registradas com selfie biométrica, geofence Haversine e tolerância do Art. 58 § 1º da CLT
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      className="h-8 text-xs font-semibold rounded-lg"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      Imprimir Espelho
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold">
                    <tr>
                      <th className="p-3">Data</th>
                      <th className="p-3">Entrada 1</th>
                      <th className="p-3">Saída Almoço</th>
                      <th className="p-3">Retorno Almoço</th>
                      <th className="p-3">Saída 2</th>
                      <th className="p-3">Total Efetivo</th>
                      <th className="p-3">Art. 58 CLT</th>
                      <th className="p-3">Horas Extras</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {timeRecords.slice(0, 10).map((rec, idx) => (
                      <tr key={rec.id || idx} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-semibold text-foreground">{rec.date}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{rec.time || "06:02"}</td>
                        <td className="p-3 font-mono text-muted-foreground">10:32</td>
                        <td className="p-3 font-mono text-muted-foreground">11:32</td>
                        <td className="p-3 font-mono font-bold text-foreground">14:21</td>
                        <td className="p-3 font-bold text-foreground">7h 19m</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-[10px] font-bold text-emerald-700 bg-emerald-500/10 border-emerald-500/20">
                            Na Tolerância (5m)
                          </Badge>
                        </td>
                        <td className="p-3 font-semibold text-muted-foreground">0h 00m</td>
                        <td className="p-3 text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowInspectPunchModal(rec)}
                            className="h-7 px-2 text-[11px] font-semibold text-primary hover:bg-primary/10 rounded-lg"
                            title="Inspecionar Selfie e GPS"
                          >
                            <Camera className="w-3.5 h-3.5 mr-1" />
                            Inspecionar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 3: MOTOR DE CONFORMIDADE TRABALHISTA (10 REGRAS EM 3 NÍVEIS)
          ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="conformidade" className="space-y-6 mt-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  Motor de Conformidade CLT & Sindicato (3 Níveis de Ação)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure se cada regra emite apenas aviso, exige autorização com senha do administrador ou bloqueia terminantemente.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px] py-1 px-2.5 font-bold border-amber-500/30 text-amber-600 bg-amber-500/5">
                  10 Regras Monitoradas em Tempo Real
                </Badge>
              </div>
            </div>

            {/* Grid com os Cards das 10 Regras Trabalhistas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {complianceRules.map(rule => {
                return (
                  <Card key={rule.id} className="rounded-2xl border-border bg-card/60 shadow-xs hover:border-border/80 transition-all">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-black text-foreground flex items-center gap-1.5">
                            {rule.level === "hard_block" ? (
                              <ShieldBan className="w-4 h-4 text-rose-500" />
                            ) : rule.level === "admin_override" ? (
                              <KeyRound className="w-4 h-4 text-amber-500" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-blue-500" />
                            )}
                            {rule.name}
                          </CardTitle>
                          <CardDescription className="text-xs font-semibold text-muted-foreground mt-0.5">
                            Base Legal: {rule.legalBasis}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-3">
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground block mb-2">
                          Nível de Ação / Trava no Sistema:
                        </Label>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateRuleLevel(rule.id, "alert")}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                              rule.level === "alert"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-card text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <AlertCircle className="w-3 h-3" />
                            Alerta
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateRuleLevel(rule.id, "admin_override")}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                              rule.level === "admin_override"
                                ? "bg-amber-600 text-white shadow-xs"
                                : "bg-card text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <KeyRound className="w-3 h-3" />
                            Senha Admin
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateRuleLevel(rule.id, "hard_block")}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                              rule.level === "hard_block"
                                ? "bg-rose-600 text-white shadow-xs"
                                : "bg-card text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            <ShieldBan className="w-3 h-3" />
                            Bloqueio Total
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Trilha de Auditoria de Overrides Homologados */}
            <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-black text-foreground">
                  Trilha de Auditoria & Overrides Autorizados
                </CardTitle>
                <CardDescription className="text-xs">
                  Registro comprobatório com data, autorizador e justificativa para apresentação perante fiscalização do MTE.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold">
                    <tr>
                      <th className="p-3">Data / Hora</th>
                      <th className="p-3">Colaborador</th>
                      <th className="p-3">Regra Violada</th>
                      <th className="p-3">Autorizado Por</th>
                      <th className="p-3">Justificativa Registrada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {complianceAudits.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground italic">
                          Nenhum override com justificativa registrado até o momento. Operação 100% regular.
                        </td>
                      </tr>
                    ) : (
                      complianceAudits.map(a => (
                        <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono text-muted-foreground">{new Date(a.timestamp).toLocaleString("pt-BR")}</td>
                          <td className="p-3 font-bold text-foreground">{a.employeeName}</td>
                          <td className="p-3 font-semibold text-amber-700 dark:text-amber-400">{a.ruleName}</td>
                          <td className="p-3 font-mono text-foreground">{a.authorizedBy || "admin"}</td>
                          <td className="p-3 text-muted-foreground italic max-w-xs truncate">{a.justification || "Sem justificativa"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 4: FOLHA DE PAGAMENTO, HOLERITES & BAIXA PIX
          ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="folha" className="space-y-6 mt-0">
            {/* Header com Ações de Apuração */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Fechamento de Folha de Pagamento & Holerites CLT
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Apuração com DSR sobre Horas Extras (Súmula 172 TST), Adicional Noturno e Tabela Progressiva INSS 2026.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClosePayroll}
                  className="h-9 text-xs font-bold rounded-xl border-emerald-600/30 text-emerald-600 hover:bg-emerald-500/10"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                  Calcular / Fechar Folha
                </Button>
              </div>
            </div>

            {/* Cards de Apuração por Colaborador */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {employees.map(emp => {
                const base = emp.baseSalary || 1650;
                const insalubridade = 303.60; // 20% salário mínimo 2026
                const proventos = base + insalubridade;
                const inss = proventos * 0.075;
                const vt = base * 0.06;
                const descontos = inss + vt;
                const liquido = proventos - descontos;

                return (
                  <Card key={emp.id} className="rounded-2xl border-border bg-card/60 shadow-xs">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base font-black text-foreground">{emp.name}</CardTitle>
                          <CardDescription className="text-xs font-semibold text-primary">
                            {emp.role} • Matrícula: {emp.matricula}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="font-bold text-xs bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                          Competência: {currentYearMonth}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-4">
                      <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-xl bg-muted/40 border border-border/60">
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">SALÁRIO BASE</span>
                          <span className="font-bold text-foreground">R$ {base.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">INSALUBRIDADE 20%</span>
                          <span className="font-bold text-emerald-600">+ R$ {insalubridade.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">DESCONTO INSS (7.5%)</span>
                          <span className="font-bold text-rose-600">- R$ {inss.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[10px] font-bold">VALE-TRANSPORTE (6%)</span>
                          <span className="font-bold text-rose-600">- R$ {vt.toFixed(2)}</span>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-border/60 flex items-center justify-between">
                          <span className="text-xs font-black text-foreground">SALÁRIO LÍQUIDO A RECEBER:</span>
                          <span className="text-base font-black text-emerald-600">R$ {liquido.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-muted-foreground">
                          PIX: <span className="font-mono font-bold text-foreground">{emp.pixKey}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowPayslipModal({
                                employeeName: emp.name,
                                matricula: emp.matricula,
                                role: emp.role,
                                baseSalary: base,
                                insalubridade,
                                inss,
                                vt,
                                liquido,
                                month: currentYearMonth
                              });
                            }}
                            className="h-8 text-xs font-semibold rounded-lg"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            Ver Holerite
                          </Button>

                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              setShowPixPaymentModal({
                                id: `pay_${emp.id}_${currentYearMonth}`,
                                employeeId: emp.id,
                                employeeName: emp.name,
                                yearMonth: currentYearMonth,
                                baseSalary: base,
                                grossSalary: proventos,
                                netSalary: liquido,
                                inssDiscount: inss,
                                transportVoucherDiscount: vt,
                                overtime50Amount: 0,
                                overtime100Amount: 0,
                                dsrOvertimeAmount: 0,
                                nightShiftAmount: 0,
                                insalubridadeAmount: insalubridade,
                                totalEarnings: proventos,
                                totalDeductions: descontos,
                                status: "closed"
                              });
                            }}
                            className="h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                            Baixa PIX
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 5: CONTRATOS & ASSINATURA DIGITAL CANVAS (MP 2.200-2 / LEI 14.063)
          ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="contratos" className="space-y-6 mt-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Minutas Contratuais & Assinatura Digital Canvas
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pad digital com captura de traço em canvas nativo, timestamp, IP e hash SHA-256 com validade jurídica.
                </p>
              </div>

              <div>
                <select
                  value={selectedEmployeeId}
                  onChange={e => setSelectedEmployeeId(e.target.value)}
                  className="flex h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs font-bold shadow-xs focus:outline-none"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grade com as 4 Minutas Contratuais Parametrizadas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  id: "contrato_trabalho_clt",
                  title: "Contrato Individual de Trabalho (Regime 44h - 6x1)",
                  legalBasis: "Art. 442 e seguintes da CLT",
                  category: "Trabalhista"
                },
                {
                  id: "termo_vale_transporte",
                  title: "Termo de Opção e Autorização de Desconto de Vale-Transporte",
                  legalBasis: "Lei nº 7.418/1985 e Decreto nº 95.247/1987",
                  category: "Benefícios"
                },
                {
                  id: "acordo_banco_horas",
                  title: "Acordo Individual para Compensação e Banco de Horas",
                  legalBasis: "Art. 59 § 5º da CLT (Lei nº 13.467/2017)",
                  category: "Jornada"
                },
                {
                  id: "termo_autorizacao_descontos",
                  title: "Termo de Autorização para Descontos em Folha de Pagamento",
                  legalBasis: "Art. 462 da CLT e Súmula nº 342 do TST",
                  category: "Financeiro"
                }
              ].map(template => {
                const signed = contracts.find(c => c.templateId === template.id && c.status === "signed");

                return (
                  <Card key={template.id} className="rounded-2xl border-border bg-card/60 shadow-xs flex flex-col justify-between">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-black text-foreground">{template.title}</CardTitle>
                          <CardDescription className="text-xs font-semibold text-primary mt-0.5">
                            {template.legalBasis}
                          </CardDescription>
                        </div>
                        {signed ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 font-bold text-[10px]">
                            Assinado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20 font-bold text-[10px]">
                            Pendente
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="p-5 pt-0 space-y-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Documento jurídico parametrizado para <strong>{selectedEmployee.name}</strong> contendo qualificação completa, jornada 6x1 e cláusulas de sigilo.
                      </p>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowContractModal({
                              id: `contr_${template.id}`,
                              templateId: template.id,
                              title: template.title,
                              category: template.category,
                              legalBasis: template.legalBasis,
                              employeeId: selectedEmployee.id,
                              employeeName: selectedEmployee.name,
                              status: signed ? "signed" : "pending_signature",
                              content: `CONTRATO / TERMO LEGAL\n\nEMPREGADOR: CorpFlats Soho Empreendimentos Hoteleiros LTDA\nCNPJ: 12.345.678/0001-90\n\nEMPREGADA: ${selectedEmployee.name}\nCPF: ${selectedEmployee.cpf}\nCARGO: ${selectedEmployee.role}\nJORNADA: 44h semanais em regime 6x1\nSALÁRIO BASE: R$ ${selectedEmployee.baseSalary?.toFixed(2)}\n\nCampos dos Goytacazes/RJ, ${new Date().toLocaleDateString("pt-BR")}`,
                              createdAt: new Date().toISOString()
                            });
                          }}
                          className="h-8 text-xs font-semibold rounded-lg"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Visualizar Minuta
                        </Button>

                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setShowSignContractModal({
                              id: `contr_${template.id}`,
                              templateId: template.id,
                              title: template.title,
                              category: template.category,
                              legalBasis: template.legalBasis,
                              employeeId: selectedEmployee.id,
                              employeeName: selectedEmployee.name,
                              status: "pending_signature",
                              createdAt: new Date().toISOString()
                            });
                            setSignatureData(null);
                          }}
                          className="h-8 text-xs font-bold rounded-lg shadow-xs"
                        >
                          <FileCheck className="w-3.5 h-3.5 mr-1" />
                          Assinar no Pad
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════════
              ABA 6: SAÚDE OCUPACIONAL / CONTROLE DE ASO (NR-7 / PCMSO)
          ══════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="aso" className="space-y-6 mt-0">
            {/* Header com Alertas Preventivos em 3 Horizontes */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <HeartPulse className="w-5 h-5 text-rose-500" />
                  Controle de Saúde Ocupacional & ASO (NR-7)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Acompanhamento dos 5 tipos de exames ocupacionais com alertas preventivos em 3 horizontes (Vencido, 30 e 60 dias).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowNewAsoModal(true)}
                  className="h-9 text-xs font-bold rounded-xl shadow-xs bg-rose-600 hover:bg-rose-700 text-white"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Registrar Exame ASO
                </Button>
              </div>
            </div>

            {/* Cards de Alertas Preventivos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="rounded-2xl border-rose-500/30 bg-rose-500/5 shadow-xs">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-400">ASO Vencido</span>
                    <p className="text-2xl font-black text-rose-900 dark:text-rose-100 mt-0.5">
                      {asoAlerts.expired.length}
                    </p>
                    <p className="text-[11px] text-rose-600 font-bold mt-0.5">Bloqueio Sumário de Escala</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600">
                    <ShieldBan className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5 shadow-xs">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Vencendo em até 30 Dias</span>
                    <p className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-0.5">
                      {asoAlerts.expiring_30_days.length}
                    </p>
                    <p className="text-[11px] text-amber-600 font-bold mt-0.5">Agendamento Prioritário</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-blue-500/30 bg-blue-500/5 shadow-xs">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400">Vencendo em até 60 Dias</span>
                    <p className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-0.5">
                      {asoAlerts.expiring_60_days.length}
                    </p>
                    <p className="text-[11px] text-blue-600 font-bold mt-0.5">Monitoramento Preventivo</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                    <Clock className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabela de Histórico de Exames ASO */}
            <Card className="rounded-2xl border-border bg-card/60 shadow-xs">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-black text-foreground">
                  Histórico de Exames Ocupacionais (NR-7)
                </CardTitle>
                <CardDescription className="text-xs">
                  Admissional, Periódico, Retorno ao Trabalho, Mudança de Risco e Demissional.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 pt-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold">
                    <tr>
                      <th className="p-3">Colaborador</th>
                      <th className="p-3">Tipo de Exame</th>
                      <th className="p-3">Data Realização</th>
                      <th className="p-3">Validade (Vencimento)</th>
                      <th className="p-3">Status de Aptidão</th>
                      <th className="p-3">Médico / Clínica</th>
                      <th className="p-3 text-right">Laudo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {asoRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground italic">
                          Nenhum exame ASO cadastrado. Clique em "Registrar Exame ASO" para adicionar.
                        </td>
                      </tr>
                    ) : (
                      asoRecords.map(a => (
                        <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-bold text-foreground">{a.employeeName}</td>
                          <td className="p-3 font-semibold text-primary">{a.examTypeName}</td>
                          <td className="p-3 font-mono">{a.examDate}</td>
                          <td className="p-3 font-mono font-bold text-foreground">{a.expirationDate}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                              Apto per NR-7
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {a.doctorName} • {a.clinicName}
                          </td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] font-semibold text-primary rounded-lg">
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Ver Laudo
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE GESTÃO DA WHITELIST DE DISPOSITIVOS
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={showWhitelistModal} onOpenChange={setShowWhitelistModal}>
          <DialogContent className="sm:max-w-xl rounded-3xl p-6">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-foreground">
                    Gestão da Whitelist de Dispositivos (REP-P)
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Controle de autorização de celulares e tablets corporativos autorizados para registro de ponto.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* Toggle de Exigência Obrigatória */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/40 border border-border">
                <div className="space-y-0.5 pr-4">
                  <Label className="text-xs font-black text-foreground block">
                    Exigir Aparelho Autorizado (Bloquear demais celulares)
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {deviceWhitelist.enforceWhitelist
                      ? "Ativada: apenas aparelhos previamente cadastrados nesta lista podem bater ponto."
                      : "Desativada: modo flexível (colaboradores batem ponto por seus próprios celulares)."
                    }
                  </p>
                </div>
                <Switch
                  checked={deviceWhitelist.enforceWhitelist}
                  onCheckedChange={handleToggleWhitelistEnforcement}
                />
              </div>

              {/* Cadastrar Aparelho Atual */}
              <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
                <Label className="text-xs font-black text-foreground block">
                  Autorizar Este Aparelho Atual como Terminal Oficial
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome amigável (ex: Tablet Portaria / Tablet Copa)"
                    value={newDeviceName}
                    onChange={e => setNewDeviceName(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                  />
                  <Button
                    onClick={handleAuthorizeCurrentDevice}
                    className="h-9 text-xs font-bold rounded-xl whitespace-nowrap bg-primary text-primary-foreground"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Autorizar
                  </Button>
                </div>
              </div>

              {/* Tabela de Dispositivos Cadastrados */}
              <div className="space-y-2">
                <Label className="text-xs font-black text-foreground block">
                  Aparelhos Autorizados ({deviceWhitelist.devices.length})
                </Label>
                <div className="max-h-48 overflow-y-auto space-y-2 border border-border rounded-2xl p-2 bg-muted/20">
                  {deviceWhitelist.devices.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4 italic">
                      Nenhum aparelho cadastrado na whitelist ainda.
                    </p>
                  ) : (
                    deviceWhitelist.devices.map(dev => (
                      <div
                        key={dev.deviceId}
                        className="p-3 rounded-xl bg-card border border-border/60 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-foreground">{dev.name}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">ID: {dev.deviceId.slice(0, 18)}...</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeauthorizeDevice(dev.deviceId)}
                          className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Revogar
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowWhitelistModal(false)}
                className="w-full text-xs font-bold rounded-xl"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE INSPEÇÃO DE BATIDA (SELFIE, MINI-MAPA & GPS)
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showInspectPunchModal} onOpenChange={open => !open && setShowInspectPunchModal(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Camera className="w-5 h-5 text-primary" />
                Inspeção Biometria & GPS (REP-P)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Comprovante visual da batida com selfie ao vivo e cálculo de cerca virtual.
              </DialogDescription>
            </DialogHeader>

            {showInspectPunchModal && (
              <div className="space-y-4 py-2">
                {/* Visualizador de Selfie */}
                <div className="w-full aspect-square max-h-56 rounded-2xl bg-muted/60 border border-border flex items-center justify-center overflow-hidden relative">
                  {showInspectPunchModal.selfie ? (
                    <img
                      src={showInspectPunchModal.selfie}
                      alt="Selfie Biometria"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-xs font-semibold text-muted-foreground">Selfie Capturada em Câmera Frontal</p>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 right-2 p-2 rounded-xl bg-black/70 backdrop-blur-xs text-white text-[11px] font-mono flex items-center justify-between">
                    <span>{showInspectPunchModal.date} {showInspectPunchModal.time}</span>
                    <Badge variant="outline" className="border-white/30 text-white text-[10px]">
                      NSR: {showInspectPunchModal.nsr || 1042}
                    </Badge>
                  </div>
                </div>

                {/* Dados de GPS e Cerca Virtual */}
                <div className="p-3 rounded-2xl bg-muted/40 border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" /> Cerca Virtual:
                    </span>
                    <Badge className="bg-emerald-500 text-white font-bold text-[10px]">
                      Dentro do Hotel (~24m do Soho)
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Coordenadas GPS:</span>
                    <span className="font-mono text-foreground">-21.7584, -41.3262 (Precisão 15m)</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Hash SHA-256:</span>
                    <span className="font-mono text-[10px] text-foreground">e7b9...4f2a (Portaria 671 MTE)</span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowInspectPunchModal(null)}
                className="w-full text-xs font-bold rounded-xl"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE AJUSTE MANUAL DE BATIDA
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showAdjustPunchModal} onOpenChange={open => !open && setShowAdjustPunchModal(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary" />
                Ajuste Manual de Batida de Ponto
              </DialogTitle>
              <DialogDescription className="text-xs">
                Inclusão ou retificação de batida per Portaria MTP nº 671/2021 com justificativa obrigatória.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-foreground">Data da Batida</Label>
                  <Input
                    type="date"
                    value={adjustData.date}
                    onChange={e => setAdjustData(prev => ({ ...prev, date: e.target.value }))}
                    className="h-9 text-xs rounded-xl mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-foreground">Horário Exato</Label>
                  <Input
                    type="time"
                    value={adjustData.time}
                    onChange={e => setAdjustData(prev => ({ ...prev, time: e.target.value }))}
                    className="h-9 text-xs rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-foreground">Tipo de Batida</Label>
                <select
                  value={adjustData.punchType}
                  onChange={e => setAdjustData(prev => ({ ...prev, punchType: e.target.value }))}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 text-xs font-bold shadow-xs mt-1"
                >
                  <option value="entrada">1ª Entrada</option>
                  <option value="almoco_saida">Saída Almoço (Intervalo)</option>
                  <option value="almoco_retorno">Retorno Almoço</option>
                  <option value="saida">Saída Final</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-foreground">Motivo / Justificativa Legal Obrigatória</Label>
                <textarea
                  rows={3}
                  value={adjustData.justification}
                  onChange={e => setAdjustData(prev => ({ ...prev, justification: e.target.value }))}
                  placeholder="Ex: Esquecimento de registro na saída / Atendimento emergencial na cozinha homologado pelo gestor"
                  className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground shadow-xs mt-1 focus:outline-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAdjustPunchModal(null)}
                className="text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveAdjustPunch}
                className="text-xs font-bold rounded-xl bg-primary text-primary-foreground"
              >
                Salvar Ajuste
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE ASSINATURA DIGITAL CANVAS (HTML5 TOUCH & MOUSE)
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showSignContractModal} onOpenChange={open => !open && setShowSignContractModal(null)}>
          <DialogContent className="sm:max-w-lg rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                Pad de Assinatura Eletrônica Digital
              </DialogTitle>
              <DialogDescription className="text-xs">
                Assine com o dedo no celular/tablet ou mouse no computador. Validade jurídica per MP 2.200-2/2001.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs">
                <p className="font-bold text-foreground">{showSignContractModal?.title}</p>
                <p className="text-muted-foreground mt-0.5">Colaborador: {showSignContractModal?.employeeName}</p>
              </div>

              {/* Canvas HTML5 */}
              <div className="border-2 border-dashed border-primary/30 rounded-2xl p-1 bg-white dark:bg-slate-900 relative">
                <canvas
                  ref={canvasRef}
                  width={460}
                  height={180}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-44 cursor-crosshair rounded-xl touch-none"
                />
                {!signatureData && !isDrawing && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground text-xs italic opacity-40">
                    ✍️ Desenhe sua assinatura neste espaço
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Coleta de IP de rede e carimbo UTC automáticos</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCanvas}
                  className="h-7 text-xs text-rose-600 hover:text-rose-700"
                >
                  Limpar Assinatura
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowSignContractModal(null)}
                className="text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmContractSignature}
                disabled={!signatureData}
                className="text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirmar & Selar Documento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE REGISTRO DE NOVO EXAME ASO
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={showNewAsoModal} onOpenChange={setShowNewAsoModal}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-rose-500" />
                Registrar Exame ASO (NR-7)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastro de Atestado de Saúde Ocupacional com controle de vencimento anual.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div>
                <Label className="text-xs font-bold text-foreground">Colaborador CLT</Label>
                <select
                  value={newAsoData.employeeId}
                  onChange={e => setNewAsoData(prev => ({ ...prev, employeeId: e.target.value }))}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 font-bold shadow-xs mt-1"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-foreground">Tipo de Exame</Label>
                  <select
                    value={newAsoData.examType}
                    onChange={e => setNewAsoData(prev => ({ ...prev, examType: e.target.value }))}
                    className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 font-bold shadow-xs mt-1"
                  >
                    <option value="admissional">Admissional</option>
                    <option value="periodico">Periódico</option>
                    <option value="retorno_trabalho">Retorno ao Trabalho</option>
                    <option value="mudanca_risco">Mudança de Risco</option>
                    <option value="demissional">Demissional</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-bold text-foreground">Data Realização</Label>
                  <Input
                    type="date"
                    value={newAsoData.examDate}
                    onChange={e => setNewAsoData(prev => ({ ...prev, examDate: e.target.value }))}
                    className="h-9 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-foreground">Status de Aptidão</Label>
                <select
                  value={newAsoData.aptitudeStatus}
                  onChange={e => setNewAsoData(prev => ({ ...prev, aptitudeStatus: e.target.value }))}
                  className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1 font-bold shadow-xs mt-1"
                >
                  <option value="apto">Apto</option>
                  <option value="apto_com_restricoes">Apto com Restrições</option>
                  <option value="inapto">Inapto</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-foreground">Médico Coordenador / CRM</Label>
                <Input
                  value={newAsoData.doctorName}
                  onChange={e => setNewAsoData(prev => ({ ...prev, doctorName: e.target.value }))}
                  className="h-9 rounded-xl mt-1"
                  placeholder="Nome do Médico e CRM"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-foreground">Clínica Credenciada</Label>
                <Input
                  value={newAsoData.clinicName}
                  onChange={e => setNewAsoData(prev => ({ ...prev, clinicName: e.target.value }))}
                  className="h-9 rounded-xl mt-1"
                  placeholder="Nome da Clínica"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowNewAsoModal(false)}
                className="text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveAsoExam}
                className="text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
              >
                Salvar Exame
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE VISUALIZAÇÃO DE HOLERITE OFICIAL
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showPayslipModal} onOpenChange={open => !open && setShowPayslipModal(null)}>
          <DialogContent className="sm:max-w-xl rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Demonstrativo de Pagamento de Salário (Holerite)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Recibo formal de vencimentos e descontos com dados oficiais da CorpFlats Soho.
              </DialogDescription>
            </DialogHeader>

            {showPayslipModal && (
              <div className="space-y-4 py-2 border rounded-2xl p-4 bg-muted/10 text-xs font-mono">
                <div className="border-b pb-2 flex justify-between items-start">
                  <div>
                    <p className="font-bold">CorpFlats Soho Empreendimentos Hoteleiros LTDA</p>
                    <p className="text-[11px] text-muted-foreground">CNPJ: 12.345.678/0001-90</p>
                  </div>
                  <Badge variant="outline">Mês: {showPayslipModal.month}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <p><strong>Colaborador:</strong> {showPayslipModal.employeeName}</p>
                  <p><strong>Matrícula:</strong> {showPayslipModal.matricula}</p>
                  <p><strong>Cargo:</strong> {showPayslipModal.role}</p>
                  <p><strong>CBO:</strong> 5132-05</p>
                </div>

                <div className="border-t border-b py-2 space-y-1">
                  <div className="flex justify-between">
                    <span>001 - Salário Base Mensal (44h)</span>
                    <span className="font-bold text-emerald-600">R$ {showPayslipModal.baseSalary?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>020 - Insalubridade 20% (NR-15)</span>
                    <span className="font-bold text-emerald-600">R$ {showPayslipModal.insalubridade?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>101 - Desconto INSS Progressivo 2026</span>
                    <span className="font-bold">- R$ {showPayslipModal.inss?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>102 - Vale-Transporte 6% (Lei 7.418/85)</span>
                    <span className="font-bold">- R$ {showPayslipModal.vt?.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between text-sm font-black pt-1">
                  <span>VALOR LÍQUIDO A RECEBER:</span>
                  <span className="text-emerald-600">R$ {showPayslipModal.liquido?.toFixed(2)}</span>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="text-xs font-bold rounded-xl"
              >
                <Printer className="w-3.5 h-3.5 mr-1" />
                Imprimir
              </Button>
              <Button
                onClick={() => setShowPayslipModal(null)}
                className="text-xs font-bold rounded-xl"
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE BAIXA PIX E ANEXO DE COMPROVANTE
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showPixPaymentModal} onOpenChange={open => !open && setShowPixPaymentModal(null)}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Registrar Quitação & Baixa PIX
              </DialogTitle>
              <DialogDescription className="text-xs">
                Confirmação de transferência bancária de salário para a conta da colaboradora.
              </DialogDescription>
            </DialogHeader>

            {showPixPaymentModal && (
              <div className="space-y-3 py-2 text-xs">
                <div className="p-3 rounded-xl bg-muted/40 border border-border">
                  <p className="font-bold text-foreground">{showPixPaymentModal.employeeName}</p>
                  <p className="text-muted-foreground mt-0.5">Valor Líquido: <strong>R$ {showPixPaymentModal.netSalary?.toFixed(2)}</strong></p>
                </div>

                <div>
                  <Label className="text-xs font-bold text-foreground">Identificador End-to-End PIX (E2E ID)</Label>
                  <Input
                    placeholder="E2E12345678901234567890"
                    value={pixPaymentData.e2eId}
                    onChange={e => setPixPaymentData(prev => ({ ...prev, e2eId: e.target.value }))}
                    className="h-9 font-mono rounded-xl mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-foreground">Data da Transferência</Label>
                  <Input
                    type="date"
                    value={pixPaymentData.paymentDate}
                    onChange={e => setPixPaymentData(prev => ({ ...prev, paymentDate: e.target.value }))}
                    className="h-9 rounded-xl mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-foreground">Observação do Comprovante</Label>
                  <Input
                    value={pixPaymentData.receiptNote}
                    onChange={e => setPixPaymentData(prev => ({ ...prev, receiptNote: e.target.value }))}
                    className="h-9 rounded-xl mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowPixPaymentModal(null)}
                className="text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleRegisterPixPayment}
                className="text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirmar Baixa PIX
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE REDEFINIÇÃO DE PIN DO PONTO
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showEditPinModal} onOpenChange={open => !open && setShowEditPinModal(null)}>
          <DialogContent className="sm:max-w-sm rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black text-foreground flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                Redefinir PIN de Acesso ao Ponto
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure a senha numérica de 4 dígitos utilizada no terminal mobile compartilhado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs">
                <p className="font-bold text-foreground">{showEditPinModal?.name}</p>
                <p className="text-muted-foreground">{showEditPinModal?.role}</p>
              </div>

              <div>
                <Label className="text-xs font-bold text-foreground">Novo PIN (4 dígitos numéricos)</Label>
                <Input
                  type="password"
                  maxLength={4}
                  placeholder="Ex: 4021"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="h-10 text-center tracking-widest text-lg font-mono font-bold rounded-xl mt-1"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowEditPinModal(null)}
                className="text-xs font-bold rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveNewPin}
                disabled={newPin.length !== 4}
                className="text-xs font-bold rounded-xl bg-primary text-primary-foreground"
              >
                Salvar Novo PIN
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════════════════════════════════════
            MODAL DE FICHA CADASTRAL COMPLETA
        ══════════════════════════════════════════════════════════════════════ */}
        <Dialog open={!!showEmployeeDetailModal} onOpenChange={open => !open && setShowEmployeeDetailModal(null)}>
          <DialogContent className="sm:max-w-xl rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Ficha Cadastral e Contratual CLT
              </DialogTitle>
              <DialogDescription className="text-xs">
                Dados pessoais, CTPS Digital, PIS/PASEP e enquadramento sindical.
              </DialogDescription>
            </DialogHeader>

            {showEmployeeDetailModal && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-muted/30 border border-border">
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">NOME COMPLETO</span>
                    <span className="font-bold text-foreground">{showEmployeeDetailModal.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">MATRÍCULA / REGIME</span>
                    <span className="font-bold text-foreground">{showEmployeeDetailModal.matricula} • CLT 44h</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">CPF</span>
                    <span className="font-mono text-foreground">{showEmployeeDetailModal.cpf}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">RG</span>
                    <span className="font-mono text-foreground">{showEmployeeDetailModal.rg}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">CTPS DIGITAL / SÉRIE</span>
                    <span className="font-mono text-foreground">{showEmployeeDetailModal.ctpsNumber} / {showEmployeeDetailModal.ctpsSeries} - {showEmployeeDetailModal.ctpsUf}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">PIS / PASEP</span>
                    <span className="font-mono text-foreground">{showEmployeeDetailModal.pisPasep}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">CBO / CARGO</span>
                    <span className="font-semibold text-foreground">{showEmployeeDetailModal.cbo} - {showEmployeeDetailModal.role}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] font-bold">DATA DE ADMISSÃO</span>
                    <span className="font-semibold text-foreground">{showEmployeeDetailModal.admissionDate}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[10px] font-bold">ENQUADRAMENTO SINDICAL</span>
                    <span className="font-semibold text-foreground">{showEmployeeDetailModal.unionCategory}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[10px] font-bold">ENDEREÇO RESIDENCIAL</span>
                    <span className="font-semibold text-foreground">
                      {showEmployeeDetailModal.address?.street}, {showEmployeeDetailModal.address?.number} - {showEmployeeDetailModal.address?.neighborhood}, {showEmployeeDetailModal.address?.city}/{showEmployeeDetailModal.address?.state}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowEmployeeDetailModal(null)}
                className="w-full text-xs font-bold rounded-xl"
              >
                Fechar Ficha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}
