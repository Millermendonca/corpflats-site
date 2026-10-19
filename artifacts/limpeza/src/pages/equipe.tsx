import React, { useState, useEffect, useMemo } from "react";
import { Shell } from "@/components/layout";
import { useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  UserPlus,
  Phone,
  Key,
  Edit3,
  Trash2,
  Copy,
  Check,
  Search,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Building2,
  Laptop,
  AlertCircle
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_CATEGORIES,
  getDefaultModulesForRole,
  isDefaultPermissionsForRole,
  DEV_ONLY_MODULES
} from "@/lib/permissions";

export interface UserItem {
  id: number;
  username: string;
  name?: string;
  role: "dev" | "admin" | "recepcao" | "camareira" | string;
  whatsapp?: string;
  phone?: string;
  pixKey?: string;
  active?: boolean;
  lastLoginAt?: string | null;
  allowedModules?: string[];
  createdAt?: string | null;
}

export interface PermissionsSelectorProps {
  role: string;
  selectedModules: string[];
  onChange: (modules: string[]) => void;
  isDev: boolean;
}

export function PermissionsSelector({
  role,
  selectedModules,
  onChange,
  isDev
}: PermissionsSelectorProps) {
  const visibleCategories = useMemo(() => {
    return PERMISSION_CATEGORIES.filter(cat => !cat.devOnly || isDev);
  }, [isDev]);

  const allAvailableModules = useMemo(() => {
    return visibleCategories.flatMap(cat => cat.items.map(it => it.href));
  }, [visibleCategories]);

  const handleToggleModule = (href: string) => {
    if (selectedModules.includes(href)) {
      onChange(selectedModules.filter(m => m !== href));
    } else {
      onChange([...selectedModules, href]);
    }
  };

  const handleToggleCategory = (catId: string, currentAllChecked: boolean) => {
    const cat = visibleCategories.find(c => c.id === catId);
    if (!cat) return;
    const catHrefs = cat.items.map(i => i.href);
    if (currentAllChecked) {
      onChange(selectedModules.filter(m => !catHrefs.includes(m)));
    } else {
      const set = new Set([...selectedModules, ...catHrefs]);
      onChange(Array.from(set));
    }
  };

  const handleRestoreDefaults = () => {
    onChange(getDefaultModulesForRole(role));
  };

  const handleSelectAll = () => {
    onChange([...allAvailableModules]);
  };

  const handleDeselectAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-muted/40 border border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            {selectedModules.length} de {allAvailableModules.length} telas liberadas
          </span>
          {isDefaultPermissionsForRole(role, selectedModules) ? (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-primary/40 text-primary font-bold">
              Padrão do Perfil
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-bold">
              Personalizado
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRestoreDefaults}
            className="h-7 px-2 text-[11px] font-bold rounded-lg"
            title="Restaurar lista de permissões padrão deste perfil"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            <span>Padrão do Perfil</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSelectAll}
            className="h-7 px-2 text-[11px] font-bold rounded-lg"
          >
            Marcar Todos
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDeselectAll}
            className="h-7 px-2 text-[11px] font-bold rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            Desmarcar Todos
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {visibleCategories.map(cat => {
          const catHrefs = cat.items.map(it => it.href);
          const checkedCount = catHrefs.filter(h => selectedModules.includes(h)).length;
          const allChecked = catHrefs.length > 0 && checkedCount === catHrefs.length;

          return (
            <div
              key={cat.id}
              className={`rounded-2xl border transition-colors ${
                cat.devOnly
                  ? "border-purple-500/30 bg-purple-500/5 dark:bg-purple-950/20"
                  : "border-border bg-card"
              } p-3.5 space-y-2.5`}
            >
              {/* Cabeçalho da Categoria com Switch Mestre */}
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-foreground">{cat.title}</span>
                  {cat.devOnly && (
                    <Badge className="bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[9px] py-0 px-1 font-bold">
                      Exclusivo Dev
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    ({checkedCount}/{catHrefs.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                    {allChecked ? "Tudo liberado" : checkedCount === 0 ? "Nenhum" : "Parcial"}
                  </span>
                  <Switch
                    checked={allChecked}
                    onCheckedChange={() => handleToggleCategory(cat.id, allChecked)}
                    title="Marcar ou desmarcar todas as telas desta categoria"
                  />
                </div>
              </div>

              {/* Telas Individuais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {cat.items.map(item => {
                  const isChecked = selectedModules.includes(item.href);
                  return (
                    <label
                      key={item.href}
                      className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? "bg-primary/5 border-primary/30 shadow-2xs"
                          : "bg-muted/20 border-border/50 hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleModule(item.href)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground leading-tight truncate">
                            {item.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                          {item.description}
                        </p>
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          {item.href}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TeamPage() {
  const { data: currentUser } = useGetMe();
  const { toast } = useToast();

  const isDev = currentUser?.role === "dev";

  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("todos");
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [copiedPixId, setCopiedPixId] = useState<number | null>(null);

  // Modal Novo Colaborador
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<string>("camareira");
  const [newUserAllowedModules, setNewUserAllowedModules] = useState<string[]>(() => getDefaultModulesForRole("camareira"));
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newPixKey, setNewPixKey] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingNewUser, setSavingNewUser] = useState(false);
  const [newUserError, setNewUserError] = useState("");

  // Modal Editar Colaborador
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("camareira");
  const [editAllowedModules, setEditAllowedModules] = useState<string[]>([]);
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editPixKey, setEditPixKey] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [editUserError, setEditUserError] = useState("");

  // Modal Permissões de Acesso (Dedicado)
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<UserItem | null>(null);
  const [permissionsModules, setPermissionsModules] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionsError, setPermissionsError] = useState("");

  // Modal Redefinir Senha
  const [resetPwModalOpen, setResetPwModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserItem | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [savingResetPw, setSavingResetPw] = useState(false);
  const [resetPwError, setResetPwError] = useState("");

  // Carregar Usuários
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsersList(Array.isArray(data) ? data : data.users || []);
      } else {
        toast({
          title: "Erro ao listar equipe",
          description: "Não foi possível carregar a lista de colaboradores.",
          variant: "destructive"
        });
      }
    } catch {
      toast({
        title: "Erro de conexão",
        description: "Falha na comunicação com o servidor.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Métricas
  const stats = useMemo(() => {
    const total = usersList.length;
    const devs = usersList.filter(u => u.role === "dev").length;
    const admins = usersList.filter(u => u.role === "admin").length;
    const recepcao = usersList.filter(u => u.role === "recepcao").length;
    const governanca = usersList.filter(u => u.role === "camareira").length;
    const ativos = usersList.filter(u => u.active !== false).length;
    return { total, devs, admins, recepcao, governanca, ativos };
  }, [usersList]);

  // Lista Filtrada
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      // Busca textual
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.whatsapp && u.whatsapp.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.pixKey && u.pixKey.toLowerCase().includes(q));

      // Filtro de perfil
      const matchRole =
        selectedRole === "todos" ||
        u.role === selectedRole;

      // Filtro de status
      const isActive = u.active !== false;
      const matchStatus =
        selectedStatus === "todos" ||
        (selectedStatus === "ativos" && isActive) ||
        (selectedStatus === "inativos" && !isActive);

      return matchSearch && matchRole && matchStatus;
    });
  }, [usersList, searchQuery, selectedRole, selectedStatus]);

  // Copiar Chave PIX
  const handleCopyPix = (user: UserItem) => {
    if (!user.pixKey) return;
    navigator.clipboard.writeText(user.pixKey);
    setCopiedPixId(user.id);
    toast({
      title: "Chave PIX copiada!",
      description: `Chave PIX de ${user.name || user.username} copiada para a área de transferência.`
    });
    setTimeout(() => {
      setCopiedPixId(null);
    }, 2000);
  };

  // Abrir Modal de Permissões (Dedicado)
  const handleOpenPermissions = (user: UserItem) => {
    setPermissionsUser(user);
    setPermissionsModules(
      Array.isArray(user.allowedModules) && user.allowedModules.length > 0
        ? [...user.allowedModules]
        : getDefaultModulesForRole(user.role)
    );
    setPermissionsError("");
    setPermissionsModalOpen(true);
  };

  // Salvar Permissões (Dedicado)
  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionsUser) return;
    setSavingPermissions(true);
    setPermissionsError("");

    try {
      const res = await fetch(`/api/admin/users/${permissionsUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedModules: permissionsModules
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Permissões atualizadas!",
          description: `Permissões de ${permissionsUser.name || permissionsUser.username} salvas com sucesso.`
        });
        setPermissionsModalOpen(false);
        fetchUsers();
      } else {
        setPermissionsError(data.error || "Erro ao salvar permissões.");
      }
    } catch {
      setPermissionsError("Erro na comunicação com o servidor.");
    } finally {
      setSavingPermissions(false);
    }
  };

  // Abrir Modal de Edição
  const handleOpenEdit = (user: UserItem) => {
    setEditingUser(user);
    setEditName(user.name || user.username);
    setEditRole(user.role || "camareira");
    setEditWhatsapp(user.whatsapp || user.phone || "");
    setEditPixKey(user.pixKey || "");
    setEditActive(user.active !== false);
    setEditAllowedModules(
      Array.isArray(user.allowedModules) && user.allowedModules.length > 0
        ? [...user.allowedModules]
        : getDefaultModulesForRole(user.role)
    );
    setEditUserError("");
    setEditUserModalOpen(true);
  };

  // Salvar Edição
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEditUser(true);
    setEditUserError("");

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          role: editRole,
          whatsapp: editWhatsapp.trim(),
          phone: editWhatsapp.trim(),
          pixKey: editPixKey.trim(),
          active: editActive,
          allowedModules: editAllowedModules
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Colaborador atualizado!",
          description: `Os dados de ${editName.trim()} foram salvos com sucesso.`
        });
        setEditUserModalOpen(false);
        fetchUsers();
      } else {
        setEditUserError(data.error || "Erro ao atualizar colaborador.");
      }
    } catch {
      setEditUserError("Erro ao conectar com o servidor.");
    } finally {
      setSavingEditUser(false);
    }
  };

  // Criar Novo Usuário
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserError("");

    if (!newUsername.trim() || !newPassword.trim()) {
      setNewUserError("Nome de usuário e senha são obrigatórios.");
      return;
    }

    if (newPassword.trim().length < 4) {
      setNewUserError("A senha deve ter no mínimo 4 caracteres.");
      return;
    }

    setSavingNewUser(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          name: (newName.trim() || newUsername.trim()),
          password: newPassword.trim(),
          role: newUserRole,
          whatsapp: newWhatsapp.trim(),
          phone: newWhatsapp.trim(),
          pixKey: newPixKey.trim(),
          allowedModules: newUserAllowedModules
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Colaborador cadastrado!",
          description: `O colaborador ${newUsername.trim()} foi criado com sucesso.`
        });
        setNewUserModalOpen(false);
        setNewUsername("");
        setNewName("");
        setNewUserPassword("");
        setNewWhatsapp("");
        setNewPixKey("");
        setNewUserRole("camareira");
        setNewUserAllowedModules(getDefaultModulesForRole("camareira"));
        fetchUsers();
      } else {
        setNewUserError(data.error || "Erro ao cadastrar colaborador.");
      }
    } catch {
      setNewUserError("Erro ao comunicar com o servidor.");
    } finally {
      setSavingNewUser(false);
    }
  };

  // Redefinir Senha
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !newPasswordValue.trim()) return;

    if (newPasswordValue.trim().length < 4) {
      setResetPwError("A nova senha deve ter no mínimo 4 caracteres.");
      return;
    }

    setSavingResetPw(true);
    setResetPwError("");

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPasswordValue.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Senha redefinida!",
          description: `A senha de ${targetUser.name || targetUser.username} foi alterada com sucesso.`
        });
        setResetPwModalOpen(false);
        setTargetUser(null);
        setNewPasswordValue("");
      } else {
        setResetPwError(data.error || "Erro ao redefinir senha.");
      }
    } catch {
      setResetPwError("Erro na requisição ao servidor.");
    } finally {
      setSavingResetPw(false);
    }
  };

  // Excluir Colaborador
  const handleDeleteUser = async (user: UserItem) => {
    if (user.id === currentUser?.id) {
      toast({
        title: "Ação não permitida",
        description: "Você não pode excluir sua própria conta.",
        variant: "destructive"
      });
      return;
    }

    if (user.role === "dev" && !isDev) {
      toast({
        title: "Ação restrita",
        description: "Apenas Desenvolvedores podem excluir contas de desenvolvedor.",
        variant: "destructive"
      });
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o colaborador "${user.name || user.username}"? Esta ação é irreversível.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        toast({
          title: "Colaborador excluído",
          description: `O colaborador foi removido do sistema.`
        });
        fetchUsers();
      } else {
        const data = await res.json();
        toast({
          title: "Erro ao excluir",
          description: data.error || "Não foi possível excluir o usuário.",
          variant: "destructive"
        });
      }
    } catch {
      toast({
        title: "Erro de conexão",
        description: "Falha ao enviar solicitação.",
        variant: "destructive"
      });
    }
  };

  // Helper de Renderização do Badge de Perfil
  const renderRoleBadge = (role: string) => {
    switch (role) {
      case "dev":
        return (
          <Badge className="bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30 gap-1.5 font-bold hover:bg-purple-600/20">
            <Laptop className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span>Desenvolvedor</span>
          </Badge>
        );
      case "admin":
        return (
          <Badge className="bg-blue-600/15 text-blue-700 dark:text-blue-300 border-blue-500/30 gap-1.5 font-bold hover:bg-blue-600/20">
            <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            <span>Administrador</span>
          </Badge>
        );
      case "recepcao":
        return (
          <Badge className="bg-amber-600/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1.5 font-bold hover:bg-amber-600/20">
            <Building2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Recepção / Portaria</span>
          </Badge>
        );
      case "camareira":
      default:
        return (
          <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1.5 font-bold hover:bg-emerald-600/20">
            <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Governança / Camareira</span>
          </Badge>
        );
    }
  };

  return (
    <Shell>
      <div className="space-y-6 pb-20 max-w-7xl mx-auto px-4 md:px-6">
        {/* Header Principal */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border p-6 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
                  Gestão de Equipe & Níveis de Acesso
                </h1>
                <Badge variant="outline" className="text-[11px] font-bold">
                  {stats.total} Colaboradores
                </Badge>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Colaboradores da governança, recepção e administração, contatos de WhatsApp, chaves PIX e credenciais
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={loading}
              className="h-9 px-3 rounded-xl text-xs font-bold gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Atualizar</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setNewUserError("");
                setNewUserModalOpen(true);
              }}
              className="h-9 px-3.5 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Colaborador</span>
            </Button>
          </div>
        </div>

        {/* Cards de Métricas / Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          <Card className="rounded-2xl border border-border p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Total Equipe</span>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-black text-foreground mt-2">{stats.total}</div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{stats.ativos} ativos</span>
            </div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Governança</span>
              <Sparkles className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-foreground mt-2">{stats.governanca}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Camareiras e limpeza</div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Recepção</span>
              <Building2 className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-foreground mt-2">{stats.recepcao}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Portaria & atendimento</div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Administradores</span>
              <ShieldCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-foreground mt-2">{stats.admins}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Gestão operacional</div>
          </Card>

          <Card className="rounded-2xl border border-border p-4 shadow-2xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground">Desenvolvedores</span>
              <Laptop className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-foreground mt-2">{stats.devs}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Engenharia e dev</div>
          </Card>
        </div>

        {/* Filtros e Barra de Pesquisa */}
        <Card className="rounded-2xl border border-border p-4 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar por nome, @login, WhatsApp ou chave PIX..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl border-border bg-background"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Perfil:</span>
              </span>
              {[
                { key: "todos", label: "Todos" },
                { key: "dev", label: "Dev" },
                { key: "admin", label: "Admin" },
                { key: "recepcao", label: "Recepção" },
                { key: "camareira", label: "Camareiras" }
              ].map((pill) => (
                <Button
                  key={pill.key}
                  size="sm"
                  variant={selectedRole === pill.key ? "default" : "outline"}
                  onClick={() => setSelectedRole(pill.key)}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-bold"
                >
                  {pill.label}
                </Button>
              ))}

              <div className="h-4 w-[1px] bg-border mx-1 hidden sm:block" />

              <span className="text-[11px] font-bold text-muted-foreground mr-1 hidden sm:inline">Status:</span>
              {[
                { key: "todos", label: "Todos" },
                { key: "ativos", label: "Ativos" },
                { key: "inativos", label: "Inativos" }
              ].map((pill) => (
                <Button
                  key={pill.key}
                  size="sm"
                  variant={selectedStatus === pill.key ? "default" : "outline"}
                  onClick={() => setSelectedStatus(pill.key)}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-bold"
                >
                  {pill.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Lista / Tabela de Usuários */}
        <Card className="rounded-3xl border border-border shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-black text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Membros da Equipe</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Listagem completa de colaboradores cadastrados no PMS
                </CardDescription>
              </div>
              <span className="text-xs font-bold text-muted-foreground">
                Exibindo {filteredUsers.length} de {usersList.length}
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Carregando colaboradores...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Users className="w-8 h-8 text-muted-foreground/40" />
                <span className="font-bold text-foreground">Nenhum colaborador encontrado</span>
                <span>Tente ajustar os filtros ou a busca textual.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold">
                    <tr>
                      <th className="p-4">Colaborador</th>
                      <th className="p-4">Nível de Acesso</th>
                      <th className="p-4">WhatsApp / Contato</th>
                      <th className="p-4">Chave PIX</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Último Acesso</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredUsers.map((u) => {
                      const isCurrentUser = u.id === currentUser?.id;
                      const isDevUser = u.role === "dev";
                      const canManage = isDev || !isDevUser;
                      const cleanPhone = (u.whatsapp || u.phone || "").replace(/\D/g, "");

                      return (
                        <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                          {/* Colaborador */}
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                u.role === "dev" ? "bg-purple-600/10 text-purple-700 dark:text-purple-300" :
                                u.role === "admin" ? "bg-blue-600/10 text-blue-700 dark:text-blue-300" :
                                u.role === "recepcao" ? "bg-amber-600/10 text-amber-700 dark:text-amber-300" :
                                "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
                              }`}>
                                {(u.name || u.username).substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-foreground flex items-center gap-1.5">
                                  <span>{u.name || u.username}</span>
                                  {isCurrentUser && (
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-bold">
                                      Você
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  @{u.username}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Perfil */}
                          <td className="p-4">
                            <div className="flex flex-col gap-1 items-start">
                              {renderRoleBadge(u.role)}
                              <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                                <span className="font-semibold text-muted-foreground">
                                  {(u.allowedModules || getDefaultModulesForRole(u.role)).length} telas
                                </span>
                                {isDefaultPermissionsForRole(u.role, u.allowedModules) ? (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-muted text-muted-foreground font-normal">
                                    Padrão do Perfil
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[9px] py-0 px-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-bold">
                                    Personalizado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* WhatsApp */}
                          <td className="p-4">
                            {cleanPhone ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>{u.whatsapp || u.phone}</span>
                                </span>
                                <a
                                  href={`https://wa.me/${cleanPhone.startsWith("55") ? cleanPhone : "55" + cleanPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-emerald-600 transition-colors p-1 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  title="Iniciar conversa no WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic text-[11px]">—</span>
                            )}
                          </td>

                          {/* Chave PIX */}
                          <td className="p-4">
                            {u.pixKey ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded-lg border border-border/60">
                                  {u.pixKey}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCopyPix(u)}
                                  className="h-6 w-6 text-muted-foreground hover:text-primary rounded-md"
                                  title="Copiar chave PIX"
                                >
                                  {copiedPixId === u.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic text-[11px]">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-4">
                            {u.active !== false ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px] gap-1 font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Ativo</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground border-border text-[10px] gap-1 font-bold">
                                <XCircle className="w-3 h-3 text-muted-foreground" />
                                <span>Inativo</span>
                              </Badge>
                            )}
                          </td>

                          {/* Último Acesso */}
                          <td className="p-4 text-muted-foreground text-[11px]">
                            {u.lastLoginAt ? (
                              <span>{new Date(u.lastLoginAt).toLocaleString("pt-BR")}</span>
                            ) : (
                              <span className="italic">Nunca acessou</span>
                            )}
                          </td>

                          {/* Ações */}
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenPermissions(u)}
                                disabled={!canManage}
                                className="h-7 px-2 text-[11px] font-bold rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                title={canManage ? "Gerenciar permissões de telas e categorias" : "Apenas Desenvolvedores podem alterar permissões de contas dev"}
                              >
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                                <span>Acessos</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenEdit(u)}
                                disabled={!canManage}
                                className="h-7 px-2 text-[11px] font-bold rounded-lg text-foreground hover:bg-muted"
                                title={canManage ? "Editar dados" : "Apenas Desenvolvedores podem alterar contas de desenvolvedor"}
                              >
                                <Edit3 className="w-3 h-3 mr-1" />
                                <span>Editar</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setTargetUser(u);
                                  setNewPasswordValue("");
                                  setResetPwError("");
                                  setResetPwModalOpen(true);
                                }}
                                disabled={!canManage}
                                className="h-7 px-2 text-[11px] font-bold rounded-lg text-primary hover:bg-primary/10"
                                title={canManage ? "Redefinir senha" : "Apenas Desenvolvedores podem alterar senhas de dev"}
                              >
                                <Key className="w-3 h-3 mr-1" />
                                <span>Senha</span>
                              </Button>

                              {!isCurrentUser && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={!canManage}
                                  className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                                  title={canManage ? "Excluir colaborador" : "Apenas Desenvolvedores podem excluir contas de desenvolvedor"}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal: Novo Colaborador */}
        <Dialog open={newUserModalOpen} onOpenChange={setNewUserModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <span>Cadastrar Novo Colaborador</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Preencha os dados e credenciais para o novo acesso ao PMS.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4 py-2">
              {newUserError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{newUserError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Login de Acesso / Username *</Label>
                <Input
                  required
                  placeholder="ex: maria.soho"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome Completo *</Label>
                <Input
                  required
                  placeholder="ex: Maria Silva"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Perfil de Acesso / Função *</Label>
                <select
                  value={newUserRole}
                  onChange={(e) => {
                    const r = e.target.value;
                    setNewUserRole(r);
                    setNewUserAllowedModules(getDefaultModulesForRole(r));
                  }}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  <option value="camareira">🧹 Governança / Camareira (Limpeza & Diárias)</option>
                  <option value="recepcao">🛎️ Recepção / Portaria (Check-in & Café)</option>
                  <option value="admin">👔 Administrador (Gestão Hoteleira Completa)</option>
                  {isDev && (
                    <option value="dev">🛠️ Desenvolvedor (Acesso Total + Engenharia)</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">WhatsApp / Celular</Label>
                  <Input
                    placeholder="22999998888"
                    value={newWhatsapp}
                    onChange={(e) => setNewWhatsapp(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Chave PIX</Label>
                  <Input
                    placeholder="CPF, Telefone ou Chave"
                    value={newPixKey}
                    onChange={(e) => setNewPixKey(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Senha Inicial * (mínimo 4 caracteres)</Label>
                <div className="relative">
                  <Input
                    required
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="h-9 text-xs rounded-xl pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border">
                <Label className="text-xs font-bold">Permissões de Telas & Categorias</Label>
                <PermissionsSelector
                  role={newUserRole}
                  selectedModules={newUserAllowedModules}
                  onChange={setNewUserAllowedModules}
                  isDev={isDev}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewUserModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingNewUser}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {savingNewUser ? "Cadastrando..." : "Cadastrar Colaborador"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Editar Colaborador */}
        <Dialog open={editUserModalOpen} onOpenChange={setEditUserModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-primary" />
                <span>Editar Colaborador</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Atualize as informações operacionais de @{editingUser?.username}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
              {editUserError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editUserError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome Completo *</Label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Perfil de Acesso / Função *</Label>
                <select
                  value={editRole}
                  onChange={(e) => {
                    const r = e.target.value;
                    setEditRole(r);
                    setEditAllowedModules(getDefaultModulesForRole(r));
                  }}
                  disabled={editingUser?.role === "dev" && !isDev}
                  className="w-full h-9 rounded-xl border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  <option value="camareira">🧹 Governança / Camareira (Limpeza & Diárias)</option>
                  <option value="recepcao">🛎️ Recepção / Portaria (Check-in & Café)</option>
                  <option value="admin">👔 Administrador (Gestão Hoteleira Completa)</option>
                  {isDev && (
                    <option value="dev">🛠️ Desenvolvedor (Acesso Total + Engenharia)</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">WhatsApp / Celular</Label>
                  <Input
                    placeholder="22999998888"
                    value={editWhatsapp}
                    onChange={(e) => setEditWhatsapp(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Chave PIX</Label>
                  <Input
                    placeholder="CPF, Telefone ou Chave"
                    value={editPixKey}
                    onChange={(e) => setEditPixKey(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border">
                <div className="space-y-0.5">
                  <Label className="text-xs font-bold">Status do Usuário</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {editActive ? "Conta ativa e autorizada a fazer login" : "Conta desativada temporariamente"}
                  </p>
                </div>
                <Switch
                  checked={editActive}
                  onCheckedChange={setEditActive}
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border">
                <Label className="text-xs font-bold">Permissões de Telas & Categorias</Label>
                <PermissionsSelector
                  role={editRole}
                  selectedModules={editAllowedModules}
                  onChange={setEditAllowedModules}
                  isDev={isDev}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditUserModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingEditUser}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {savingEditUser ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Permissões de Acesso (Dedicado) */}
        <Dialog open={permissionsModalOpen} onOpenChange={setPermissionsModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Permissões de Acesso — @{permissionsUser?.username}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Selecione granularmente por categorias e telas os acessos permitidos para{" "}
                <strong className="text-foreground">{permissionsUser?.name || permissionsUser?.username}</strong> ({permissionsUser?.role}).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePermissions} className="space-y-4 py-2">
              {permissionsError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{permissionsError}</span>
                </div>
              )}

              <PermissionsSelector
                role={permissionsUser?.role || "camareira"}
                selectedModules={permissionsModules}
                onChange={setPermissionsModules}
                isDev={isDev}
              />

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPermissionsModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingPermissions}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {savingPermissions ? "Salvando..." : "Salvar Permissões"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Redefinir Senha */}
        <Dialog open={resetPwModalOpen} onOpenChange={setResetPwModalOpen}>
          <DialogContent className="sm:max-w-sm rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <span>Redefinir Senha</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Defina uma nova senha para {targetUser?.name || targetUser?.username}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResetPassword} className="space-y-4 py-2">
              {resetPwError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetPwError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nova Senha (mínimo 4 caracteres) *</Label>
                <div className="relative">
                  <Input
                    required
                    type={showResetPassword ? "text" : "password"}
                    placeholder="Digite a nova senha..."
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    className="h-9 text-xs rounded-xl pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetPwModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingResetPw}
                  className="rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {savingResetPw ? "Redefinindo..." : "Confirmar Nova Senha"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Shell>
  );
}

export default TeamPage;
