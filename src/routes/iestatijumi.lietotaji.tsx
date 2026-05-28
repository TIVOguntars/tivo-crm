import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Pencil } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { LoadingState, ErrorState, EmptyState } from "@/components/DataState";
import { RequireRole } from "@/components/auth/RequireRole";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  loadAdminUsersTab,
  loadAdminRolesTab,
} from "@/lib/admin-tab-data.functions";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmPageActionsRow } from "@/components/crm/CrmLayout";
import {
  CrmClearFiltersButton,
  CrmDataBody,
  CrmDataCell,
  CrmDataRow,
  CrmDataTable,
  CrmDataTableFilterRow,
  CrmDataTableHeader,
  CrmDataTableLabelRow,
  CrmFilterCell,
  CrmFilterInput,
  CrmFilterSelect,
  CrmSortableHead,
} from "@/components/crm/table/CrmDataTable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  adminUpsertProfile,
  adminSetUserRoles,
  adminSetRolePermissions,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/iestatijumi/lietotaji")({
  component: AdminUsersAndRolesPage,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <ErrorState message={error.message} />
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Lapa nav atrasta</div>,
});

type Row = Record<string, unknown>;

function s(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

// Roles shown in the "Lomas un tiesības" tab (labels in LV).
const VISIBLE_ROLE_LABELS: Record<string, string> = {
  admin: "Administrators",
  management: "Vadītājs",
  ppv: "PPV",
  marketing: "Mārketings",
  designer: "Projektētājs",
  estimator: "Tāmētājs",
};
const VISIBLE_ROLE_ORDER = ["admin", "management", "ppv", "marketing", "designer", "estimator"];

function AdminUsersAndRolesPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lietotāji un lomas"
        description="Pārvaldi CRM lietotājus, lomas un tiesības"
      />
      <RequireRole
        role="admin"
        loadingFallback={<LoadingState label="Pārbauda administratora tiesības..." />}
        fallback={
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Pieejams tikai administratoram
          </div>
        }
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="users">Lietotāji</TabsTrigger>
              <TabsTrigger value="roles">Lomas un tiesības</TabsTrigger>
            </TabsList>
            {activeTab === "users" && (
              <Button onClick={() => setUsersDialogOpen(true)}>
                Pievienot lietotāju
              </Button>
            )}
          </div>
          <TabsContent value="users" className="space-y-4">
            <UsersTab
              dialogOpen={usersDialogOpen}
              setDialogOpen={setUsersDialogOpen}
            />
          </TabsContent>
          <TabsContent value="roles" className="space-y-4">
            <RolesTab />
          </TabsContent>
        </Tabs>
      </RequireRole>
    </div>
  );
}

// ============================================================
// TAB 1 — Lietotāji
// ============================================================

function UsersTab({
  dialogOpen,
  setDialogOpen,
}: {
  dialogOpen: boolean;
  setDialogOpen: (v: boolean) => void;
}) {
  const loadFn = useServerFn(loadAdminUsersTab);
  const tabQ = useQuery({
    queryKey: ["crm", "admin-users-tab"],
    queryFn: () => loadFn(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const profiles = useMemo(
    () =>
      [...((tabQ.data?.profiles ?? []) as Row[])].sort((a, b) =>
        s(a.full_name).localeCompare(s(b.full_name), "lv"),
      ),
    [tabQ.data],
  );
  const roles = (tabQ.data?.roles ?? []) as Row[];
  const userRoles = (tabQ.data?.userRoles ?? []) as Row[];

  const roleById = useMemo(() => {
    const m = new Map<string, { id: string; role_key: string; role_name: string }>();
    for (const r of roles) {
      m.set(s(r.id), {
        id: s(r.id),
        role_key: s(r.role_key),
        role_name: s(r.role_name),
      });
    }
    return m;
  }, [roles]);

  const rolesByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const ur of userRoles) {
      const uid = s(ur.user_id);
      const rid = s(ur.role_id);
      const r = roleById.get(rid);
      if (!r) continue;
      const arr = m.get(uid) ?? [];
      arr.push(r.role_key);
      m.set(uid, arr);
    }
    return m;
  }, [userRoles, roleById]);

  const [editing, setEditing] = useState<Row | null>(null);
  // Inline filters (client-side)
  const [fId, setFId] = useState<string>("all");
  const [fSearch, setFSearch] = useState("");
  const [fRole, setFRole] = useState<string>("all");

  const allRoleOptions = useMemo(
    () => Array.from(roleById.values()),
    [roleById],
  );

  const idOptions = useMemo(() => {
    const out = new Set<string>();
    for (const p of profiles) {
      const code = s(p.user_code);
      if (code) out.add(code);
    }
    return Array.from(out).sort((a, b) => a.localeCompare(b, "lv"));
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return profiles.filter((p) => {
      const uid = s(p.id);
      const code = s(p.user_code);
      const name = s(p.full_name).toLowerCase();
      const email = s(p.email).toLowerCase();
      if (fId !== "all" && code !== fId) return false;
      if (q && !name.includes(q) && !email.includes(q)) return false;
      if (fRole !== "all") {
        const keys = rolesByUser.get(uid) ?? [];
        if (!keys.includes(fRole)) return false;
      }
      return true;
    });
  }, [profiles, rolesByUser, fId, fSearch, fRole]);

  const hasActiveFilters = fId !== "all" || fSearch.trim() !== "" || fRole !== "all";
  const clearAllFilters = () => {
    setFId("all");
    setFSearch("");
    setFRole("all");
  };

  const open = dialogOpen;
  const setOpen = (v: boolean) => {
    setDialogOpen(v);
    if (!v) setEditing(null);
  };

  if (tabQ.isLoading || !tabQ.data) {
    return <LoadingState label="Ielādē lietotājus..." />;
  }

  const error =
    tabQ.error instanceof Error
      ? tabQ.error.message
      : tabQ.data?.error || null;
  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <>
      {profiles.length === 0 ? (
        <EmptyState label="Lietotāji vēl nav pievienoti" />
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Vārds Uzvārds</TableHead>
                  <TableHead>E-pasts</TableHead>
                  <TableHead>Telefons</TableHead>
                  <TableHead>Lomas</TableHead>
                  <TableHead className="text-right">Darbības</TableHead>
                </TableRow>
                <TableRow className="crm-table-filter-row hover:bg-[var(--tivo-navy-soft)]">
                  <TableHead className="crm-table-filter-cell">
                    <Select value={fId} onValueChange={setFId}>
                      <SelectTrigger className="crm-filter-control">
                        <SelectValue placeholder="Visi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Visi</SelectItem>
                        {idOptions.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead colSpan={2} className="crm-table-filter-cell">
                    <Input
                      value={fSearch}
                      onChange={(e) => setFSearch(e.target.value)}
                      placeholder="Meklēt pēc vārda vai e-pasta..."
                      className="crm-filter-control"
                    />
                  </TableHead>
                  <TableHead className="crm-table-filter-cell" />
                  <TableHead className="crm-table-filter-cell">
                    <Select value={fRole} onValueChange={setFRole}>
                      <SelectTrigger className="crm-filter-control">
                        <SelectValue placeholder="Visas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Visas</SelectItem>
                        {allRoleOptions.map((r) => (
                          <SelectItem key={r.id} value={r.role_key}>
                            {r.role_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead className="crm-table-filter-cell text-right">
                    <div className="flex justify-end">
                      <ClearAllFiltersButton
                        active={hasActiveFilters}
                        onClick={clearAllFilters}
                      />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nav ierakstu, kas atbilst filtriem.
                    </TableCell>
                  </TableRow>
                ) : filteredProfiles.map((p) => {
                  const uid = s(p.id);
                  const keys = rolesByUser.get(uid) ?? [];
                  return (
                    <TableRow key={uid || Math.random()}>
                      <TableCell className="font-mono text-xs">{s(p.user_code) || "—"}</TableCell>
                      <TableCell className="font-medium">{s(p.full_name) || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s(p.email) || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s(p.phone) || "—"}</TableCell>
                      <TableCell>
                        {keys.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {keys.map((k) => {
                              const r = Array.from(roleById.values()).find((x) => x.role_key === k);
                              return (
                                <Badge key={k} variant="secondary" className="font-normal">
                                  {r?.role_name || k}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <ResetPasswordAction email={s(p.email)} />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(p);
                              setOpen(true);
                            }}
                          >
                            Rediģēt
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <UserFormDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        roles={Array.from(roleById.values())}
        rolesByUser={rolesByUser}
        existingProfiles={profiles}
      />
    </>
  );
}

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  roles,
  rolesByUser,
  existingProfiles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Row | null;
  roles: Array<{ id: string; role_key: string; role_name: string }>;
  rolesByUser: Map<string, string[]>;
  existingProfiles: Row[];
}) {
  const isEdit = !!editing;
  const editingId = isEdit ? s(editing!.id) : "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [userCode, setUserCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const dialogKey = `${open ? "1" : "0"}:${editingId}`;
  useStateReset(dialogKey, () => {
    setFullName(isEdit ? s(editing!.full_name) : "");
    setEmail(isEdit ? s(editing!.email) : "");
    setPhone(isEdit ? s(editing!.phone) : "");
    setUserCode(isEdit ? s(editing!.user_code).toUpperCase() : "");
    setIsActive(isEdit ? editing!.is_active !== false : true);
    setSelectedRoleKeys(isEdit ? (rolesByUser.get(editingId) ?? []) : []);
    setError(null);
  });

  const queryClient = useQueryClient();
  const { operatorId } = useCurrentUser();

  const upsertFn = useServerFn(adminUpsertProfile);
  const setRolesFn = useServerFn(adminSetUserRoles);

  const saveMut = useMutation({
    mutationFn: async (input: {
      id: string | null;
      full_name: string;
      email: string;
      user_code: string;
      phone: string | null;
      is_active: boolean;
      role_keys: string[];
    }) => {
      if (!operatorId) throw new Error("Nav izvēlēts operators");
      const up = await upsertFn({
        data: {
          actorUserId: operatorId,
          id: input.id,
          full_name: input.full_name,
          email: input.email,
          user_code: input.user_code,
          phone: input.phone,
          is_active: input.is_active,
        },
      });
      if (up?.error || !up?.id) {
        throw new Error(up?.error || "Neizdevās saglabāt lietotāju");
      }
      const setR = await setRolesFn({
        data: { userId: up.id, roleKeys: input.role_keys },
      });
      if (setR?.error) throw new Error(setR.error);
      return up.id;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Lietotājs atjaunināts" : "Lietotājs pievienots");
      queryClient.invalidateQueries({ queryKey: ["crm", "admin-users-tab"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Neizdevās saglabāt");
    },
  });

  const validate = (): string | null => {
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    const code = userCode.trim().toUpperCase();
    if (!name) return "Vārds ir obligāts";
    if (!mail) return "E-pasts ir obligāts";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return "Nederīgs e-pasts";
    if (!code) return "ID ir obligāts";
    if (code.length > 5) return "ID maksimums 5 simboli";
    const codeTaken = existingProfiles.some(
      (r) => s(r.id) !== editingId && s(r.user_code).toUpperCase() === code,
    );
    if (codeTaken) return "Šāds ID jau eksistē";
    const emailTaken = existingProfiles.some(
      (r) => s(r.id) !== editingId && s(r.email).toLowerCase() === mail,
    );
    if (emailTaken) return "Šāds e-pasts jau eksistē";
    return null;
  };

  const toggleRole = (key: string) => {
    setSelectedRoleKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    saveMut.mutate({
      id: isEdit ? editingId : null,
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      user_code: userCode.trim().toUpperCase(),
      phone: phone.trim() || null,
      is_active: isActive,
      role_keys: selectedRoleKeys,
    });
  };

  const submitting = saveMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rediģēt lietotāju" : "Pievienot lietotāju"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atjaunini lietotāja datus un lomas."
              : "Izveido jaunu CRM lietotāju un piešķir lomas."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="full_name">Vārds Uzvārds</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-pasts</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefons</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={32}
                placeholder="+371 ..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user_code">Iniciāļi / ID</Label>
              <Input
                id="user_code"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase().slice(0, 5))}
                maxLength={5}
                placeholder="GT"
                className="font-mono uppercase"
                required
              />
            </div>
            {isEdit && (
              <div className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-1">
                <Label htmlFor="is_active" className="cursor-pointer">
                  Aktīvs
                </Label>
                <Switch id="is_active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Lomas</Label>
            <div className="rounded-md border border-border p-3">
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nav pieejamu lomu.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {roles.map((r) => {
                    const checked = selectedRoleKeys.includes(r.role_key);
                    return (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleRole(r.role_key)}
                        />
                        <span>{r.role_name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Atcelt
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saglabā..." : "Saglabāt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// TAB 2 — Lomas un tiesības
// ============================================================

function RolesTab() {
  const loadFn = useServerFn(loadAdminRolesTab);
  const tabQ = useQuery({
    queryKey: ["crm", "admin-roles-tab"],
    queryFn: () => loadFn(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const roles = (tabQ.data?.roles ?? []) as Row[];
  const perms = (tabQ.data?.permissions ?? []) as Row[];
  const rolePerms = (tabQ.data?.rolePermissions ?? []) as Row[];

  const visibleRoles = useMemo(() => {
    const byKey = new Map<string, { id: string; role_key: string; role_name: string }>();
    for (const r of roles) {
      byKey.set(s(r.role_key), {
        id: s(r.id),
        role_key: s(r.role_key),
        role_name: s(r.role_name),
      });
    }
    return VISIBLE_ROLE_ORDER.map((k) => {
      const r = byKey.get(k);
      return r ? { ...r, label: VISIBLE_ROLE_LABELS[k] } : null;
    }).filter(Boolean) as Array<{
      id: string;
      role_key: string;
      role_name: string;
      label: string;
    }>;
  }, [roles]);

  const permsList = useMemo(
    () =>
      perms.map((p) => ({
        id: s(p.id),
        permission_key: s(p.permission_key),
        description: s(p.description),
      })),
    [perms],
  );

  // server snapshot: roleKey -> Set(permission_key)
  const serverMap = useMemo(() => {
    const permById = new Map(permsList.map((p) => [p.id, p.permission_key]));
    const roleById = new Map(visibleRoles.map((r) => [r.id, r.role_key]));
    const m = new Map<string, Set<string>>();
    for (const r of visibleRoles) m.set(r.role_key, new Set());
    for (const rp of rolePerms) {
      const rk = roleById.get(s(rp.role_id));
      const pk = permById.get(s(rp.permission_id));
      if (rk && pk) m.get(rk)!.add(pk);
    }
    return m;
  }, [rolePerms, visibleRoles, permsList]);

  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  // local edits: roleKey -> Set(permission_key)
  const [draft, setDraft] = useState<Map<string, Set<string>>>(new Map());

  // Initialize draft from server snapshot
  useEffect(() => {
    const next = new Map<string, Set<string>>();
    for (const [k, v] of serverMap.entries()) next.set(k, new Set(v));
    setDraft(next);
    if (!selectedRoleKey && visibleRoles.length > 0) {
      setSelectedRoleKey(visibleRoles[0].role_key);
    }
  }, [serverMap, visibleRoles, selectedRoleKey]);

  const queryClient = useQueryClient();
  const setRolePermsFn = useServerFn(adminSetRolePermissions);
  const saveMut = useMutation({
    mutationFn: async (input: { roleKey: string; permissionKeys: string[] }) => {
      const res = await setRolePermsFn({ data: input });
      if (res?.error) throw new Error(res.error);
      return true;
    },
    onSuccess: (_d, v) => {
      toast.success(`Tiesības saglabātas (${VISIBLE_ROLE_LABELS[v.roleKey] || v.roleKey})`);
      queryClient.invalidateQueries({ queryKey: ["crm", "admin-roles-tab"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Neizdevās saglabāt");
    },
  });

  if (tabQ.isLoading || !tabQ.data) {
    return <LoadingState label="Ielādē lomas un tiesības..." />;
  }
  const err =
    tabQ.error instanceof Error ? tabQ.error.message : tabQ.data?.error || null;
  if (err) return <ErrorState message={err} />;

  if (visibleRoles.length === 0) {
    return <EmptyState label="Nav pieejamu lomu" />;
  }

  const active = selectedRoleKey ?? visibleRoles[0].role_key;
  const activeRole = visibleRoles.find((r) => r.role_key === active)!;
  const draftSet = draft.get(active) ?? new Set<string>();
  const serverSet = serverMap.get(active) ?? new Set<string>();
  const dirty =
    draftSet.size !== serverSet.size || Array.from(draftSet).some((k) => !serverSet.has(k));

  const togglePerm = (key: string) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(active) ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      next.set(active, cur);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(active, on ? new Set(permsList.map((p) => p.permission_key)) : new Set());
      return next;
    });
  };

  const reset = () => {
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(active, new Set(serverSet));
      return next;
    });
  };

  const save = () => {
    saveMut.mutate({
      roleKey: active,
      permissionKeys: Array.from(draftSet),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-lg border border-border bg-card p-2">
        <ul className="space-y-1">
          {visibleRoles.map((r) => {
            const isActive = r.role_key === active;
            const count = (draft.get(r.role_key) ?? new Set()).size;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedRoleKey(r.role_key)}
                  className={
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors " +
                    (isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted")
                  }
                >
                  <span className="font-medium">{r.label}</span>
                  <Badge variant={isActive ? "secondary" : "outline"} className="font-normal">
                    {count}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h3 className="text-base font-semibold">{activeRole.label}</h3>
            <p className="text-xs text-muted-foreground">
              {activeRole.role_key} · {draftSet.size} / {permsList.length} tiesības
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>
              Atzīmēt visu
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleAll(false)}>
              Notīrīt
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              disabled={!dirty || saveMut.isPending}
            >
              Atcelt
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saveMut.isPending}>
              {saveMut.isPending ? "Saglabā..." : "Saglabāt"}
            </Button>
          </div>
        </div>

        {permsList.length === 0 ? (
          <div className="p-6">
            <EmptyState label="Nav definētu tiesību" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <ul className="divide-y divide-border">
              {permsList.map((p) => {
                const checked = draftSet.has(p.permission_key);
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded px-3 py-2 hover:bg-muted/40">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePerm(p.permission_key)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs text-foreground">{p.permission_key}</div>
                        {p.description && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {p.description}
                          </div>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

// Tiny helper: re-run an effect when `key` changes.
function useStateReset(key: string, fn: () => void) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current !== key) {
      last.current = key;
      fn();
    }
  }, [key, fn]);
}

function ResetPasswordAction({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const onClick = async () => {
    const target = (email || "").trim();
    if (!target) {
      toast.error("Lietotājam nav e-pasta");
      return;
    }
    if (!window.confirm(`Nosūtīt paroles atiestatīšanas e-pastu uz ${target}?`)) return;
    setSending(true);
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
    setSending(false);
    if (error) {
      toast.error("Neizdevās nosūtīt e-pastu");
      return;
    }
    toast.success("E-pasts nosūtīts");
  };
  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={sending}>
      {sending ? "Sūta…" : "Atiestatīt paroli"}
    </Button>
  );
}
