import { useState, useEffect, FormEvent } from 'react';
import { UserPlus, Trash2, Mail, Shield, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { OrganizationMember, Invitation, ResourcePermission, Organization } from '../types/database';
import { getStoredActiveOrganizationId } from '../lib/organization';

type PermissionKey = ResourcePermission['resource_type'];

type PermissionValues = {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

type PermissionsFormState = Record<PermissionKey, PermissionValues>;

const resourceSections: { key: PermissionKey; label: string }[] = [
  { key: 'budgets', label: 'Rozpočty' },
  { key: 'projects', label: 'Projekty' },
  { key: 'expenses', label: 'Náklady' },
  { key: 'employees', label: 'Zaměstnanci' },
  { key: 'analytics', label: 'Analytika' }
];

const defaultPermissionValues: PermissionValues = {
  can_view: true,
  can_create: false,
  can_edit: false,
  can_delete: false
};

const createDefaultPermissionsForm = (): PermissionsFormState =>
  resourceSections.reduce((acc, section) => {
    acc[section.key] = { ...defaultPermissionValues };
    return acc;
  }, {} as PermissionsFormState);

interface TeamSettingsProps {
  activeOrganizationId: string | null;
  onOrganizationUpdated?: (organization: Organization) => void;
}

export default function TeamSettings({ activeOrganizationId, onOrganizationUpdated }: TeamSettingsProps) {

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [permissions, setPermissions] = useState<ResourcePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<OrganizationMember['role'] | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [organizationStatus, setOrganizationStatus] = useState<string | null>(null);
  const [organizationError, setOrganizationError] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member' as 'admin' | 'member' | 'viewer'
  });

  const [permissionsForm, setPermissionsForm] = useState<PermissionsFormState>(() => createDefaultPermissionsForm());

  useEffect(() => {
    loadData();
  }, [activeOrganizationId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userMemberships, error: membershipError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id);

      if (membershipError) {
        console.error('Error loading memberships:', membershipError);
        return;
      }

      if (!userMemberships || userMemberships.length === 0) {
        setOrganization(null);
        setOrganizationName('');
        setCurrentUserRole(null);
        return;
      }

      const membershipsList = userMemberships as Pick<OrganizationMember, 'organization_id' | 'role'>[];
      const availableIds = membershipsList.map(member => member.organization_id);
      let targetOrganizationId = activeOrganizationId ?? getStoredActiveOrganizationId();

      if (!targetOrganizationId || !availableIds.includes(targetOrganizationId)) {
        targetOrganizationId = membershipsList[0].organization_id;

      }

      if (!targetOrganizationId) {
        setOrganization(null);
        setOrganizationName('');
        setCurrentUserRole(null);

        setMembers([]);
        setInvitations([]);
        setPermissions([]);
        return;
      }

      const [orgRes, membersRes, invitationsRes, permissionsRes] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', targetOrganizationId).single(),
        supabase
          .from('organization_members')
          .select(
            `id, organization_id, user_id, role, created_at,
            user:profiles(full_name, avatar_url)`
          )
          .eq('organization_id', targetOrganizationId),
        supabase
          .from('invitations')
          .select('*')
          .eq('organization_id', targetOrganizationId)
          .eq('status', 'pending'),
        supabase
          .from('resource_permissions')
          .select('*')
          .eq('organization_id', targetOrganizationId)
      ]);

      if (orgRes.data) {
        setOrganization(orgRes.data);
        setOrganizationName(orgRes.data.name ?? '');
        setOrganizationStatus(null);
        setOrganizationError(null);
      }
      if (membersRes.data) {
        const membersData = membersRes.data as OrganizationMember[];

        if (membersData.length > 0) {
          const userIds = membersData.map(member => member.user_id);
          let emailMap = new Map<string, string | null>();

          if (userIds.length > 0) {
            const { data: emailsData, error: emailsError } = await supabase.rpc('get_users_emails', {
              user_ids: userIds,
            });

            if (emailsError) {
              console.error('Error loading member emails:', emailsError);
            }

            emailMap = new Map<string, string | null>(
              ((emailsData ?? []) as { user_id: string; email: string | null }[]).map(entry => [
                entry.user_id,
                entry.email,
              ])
            );
          }

          const enrichedMembers = membersData.map(member => ({
            ...member,
            user: {
              email: emailMap.get(member.user_id) ?? member.user?.email ?? null,
              full_name: member.user?.full_name ?? null,
              avatar_url: member.user?.avatar_url ?? null,
            },
          }));

          if (selectedMember) {
            const updatedSelected = enrichedMembers.find(member => member.id === selectedMember.id) ?? null;
            if (updatedSelected) {
              setSelectedMember(updatedSelected);
            } else {
              setSelectedMember(null);
              setShowPermissionsModal(false);
            }
          }

          setMembers(enrichedMembers);
        } else {
          setMembers([]);
        }
      } else {
        setMembers([]);
      }
      if (invitationsRes.data) setInvitations(invitationsRes.data);
      if (permissionsRes.data) setPermissions(permissionsRes.data);

      const activeMembership = membershipsList.find(member => member.organization_id === targetOrganizationId);
      setCurrentUserRole(activeMembership?.role ?? null);
    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const canManageOrganization = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleOrganizationSave = async (event: FormEvent) => {
    event.preventDefault();

    if (!organization) return;

    const trimmedName = organizationName.trim();

    if (!trimmedName) {
      setOrganizationError('Název organizace je povinný.');
      setOrganizationStatus(null);
      return;
    }

    if (trimmedName === organization.name) {
      setOrganizationStatus('Žádné změny k uložení.');
      setOrganizationError(null);
      return;
    }

    try {
      setSavingOrganization(true);
      setOrganizationStatus(null);
      setOrganizationError(null);

      const { data, error } = await supabase
        .from('organizations')
        .update({ name: trimmedName, updated_at: new Date().toISOString() })
        .eq('id', organization.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const updated = data as Organization;
        setOrganization(updated);
        setOrganizationName(updated.name ?? '');
        setOrganizationStatus('Název organizace byl aktualizován.');
        onOrganizationUpdated?.(updated);
      }
    } catch (error) {
      console.error('Error updating organization:', error);
      setOrganizationError('Nepodařilo se uložit změny organizace.');
    } finally {
      setSavingOrganization(false);
    }
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();

    if (!organization) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const normalizedEmail = inviteForm.email.trim().toLowerCase();

      const invitationPayload = {
        organization_id: organization.id,
        email: normalizedEmail,
        role: inviteForm.role,
        invited_by: user.id,
        status: 'pending' as const,
        token: crypto.randomUUID(),
        expires_at: expiresAt.toISOString()
      };

      const { error } = await supabase
        .from('invitations')
        .insert(invitationPayload);

      if (error) throw error;

      alert('Pozvánka byla vytvořena! Uživatel ji uvidí po přihlášení.');
      setInviteForm({ email: '', role: 'member' });
      setShowInviteForm(false);
      loadData();
    } catch (error) {
      console.error('Error sending invitation:', error);
      alert('Chyba při odesílání pozvánky');
    }
  };

  const handleCancelInvitation = async (id: string) => {
    if (!confirm('Opravdu chcete zrušit tuto pozvánku?')) return;

    try {
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error canceling invitation:', error);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Opravdu chcete odebrat tohoto člena?')) return;

    try {
      const { error } = await supabase.from('organization_members').delete().eq('id', memberId);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error removing member:', error);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('organization_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  const handleOpenPermissions = (member: OrganizationMember) => {
    setSelectedMember(member);

    const memberPermissions = permissions.filter(p => p.user_id === member.user_id);
    const newPermissionsForm = createDefaultPermissionsForm();

    memberPermissions.forEach(perm => {
      if (perm.resource_type in newPermissionsForm) {
        const resourceKey = perm.resource_type as PermissionKey;
        newPermissionsForm[resourceKey] = {
          can_view: perm.can_view,
          can_create: perm.can_create,
          can_edit: perm.can_edit,
          can_delete: perm.can_delete
        };
      }
    });

    setPermissionsForm(newPermissionsForm);
    setShowPermissionsModal(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedMember || !organization) return;

    try {
      await supabase
        .from('resource_permissions')
        .delete()
        .eq('organization_id', organization.id)
        .eq('user_id', selectedMember.user_id);

      const permissionsToInsert = Object.entries(permissionsForm).map(([resource_type, perms]) => ({
        organization_id: organization.id,
        user_id: selectedMember.user_id,
        resource_type,
        ...perms
      }));

      const { error } = await supabase.from('resource_permissions').insert(permissionsToInsert);
      if (error) throw error;

      setShowPermissionsModal(false);
      setSelectedMember(null);
      loadData();
    } catch (error) {
      console.error('Error saving permissions:', error);
      alert('Chyba při ukládání oprávnění');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-blue-100 text-blue-800';
      case 'member': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleText = (role: string) => {
    switch (role) {
      case 'owner': return 'Vlastník';
      case 'admin': return 'Administrátor';
      case 'member': return 'Člen';
      case 'viewer': return 'Pozorovatel';
      default: return role;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Načítání...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#0a192f]">Tým</h2>
          <p className="text-gray-600 mt-1">{organizationName || 'Bez názvu'}</p>
        </div>
        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
        >
          <UserPlus className="w-5 h-5" />
          <span>Pozvat člena</span>
        </button>
      </div>

      {organization && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[#0a192f]">Nastavení organizace</h3>
              <p className="text-sm text-gray-500">
                Změňte název svého týmu. Tento název se zobrazuje v horní liště aplikace.
              </p>
            </div>

            <form onSubmit={handleOrganizationSave} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Název organizace</label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={event => setOrganizationName(event.target.value)}
                  readOnly={!canManageOrganization}
                  disabled={savingOrganization || !canManageOrganization}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent ${
                    canManageOrganization
                      ? 'border-gray-300'
                      : 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                  }`}
                  placeholder="Např. Dream Studio"
                />
              </div>

              {canManageOrganization && (
                <button
                  type="submit"
                  disabled={savingOrganization || !organizationName.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-[#0a192f] px-6 py-2 text-white transition hover:bg-opacity-90 disabled:opacity-60"
                >
                  {savingOrganization ? 'Ukládání...' : 'Uložit změny'}
                </button>
              )}
            </form>

            {organizationStatus && (
              <p className="text-sm text-green-600">{organizationStatus}</p>
            )}

            {organizationError && (
              <p className="text-sm text-red-600">{organizationError}</p>
            )}

            {!canManageOrganization && (
              <p className="text-xs text-gray-500">
                Pouze vlastníci nebo správci mohou upravovat název organizace.
              </p>
            )}
          </div>
        </div>
      )}

      {showInviteForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-[#0a192f] mb-4">Pozvat nového člena</h3>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  E-mail *
                </label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role *
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                >
                  <option value="viewer">Pozorovatel</option>
                  <option value="member">Člen</option>
                  <option value="admin">Administrátor</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-6 py-2 bg-[#0a192f] text-white rounded-lg hover:bg-opacity-90 transition"
              >
                Odeslat pozvánku
              </button>
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Zrušit
              </button>
            </div>
          </form>
        </div>
      )}

      {invitations.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-[#0a192f]">Čekající pozvánky</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div>
                    <div className="font-medium text-gray-900">{invitation.email}</div>
                    <div className="text-sm text-gray-500">
                      Platná do {new Date(invitation.expires_at).toLocaleDateString('cs-CZ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(invitation.role)}`}>
                    {getRoleText(invitation.role)}
                  </span>
                  <button
                    onClick={() => handleCancelInvitation(invitation.id)}
                    className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-[#0a192f]">Členové týmu</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {members.map((member) => (
            <div key={member.id} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 font-medium">
                      {(member.user?.full_name || member.user?.email || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {member.user?.full_name || member.user?.email || 'Neznámý uživatel'}
                    </div>
                    {member.user?.email && member.user?.full_name && (
                      <div className="text-sm text-gray-500">{member.user.email}</div>
                    )}
                    <div className="text-sm text-gray-500">Přidán {new Date(member.created_at).toLocaleDateString('cs-CZ')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {member.role !== 'owner' ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0a192f] focus:border-transparent"
                    >
                      <option value="viewer">Pozorovatel</option>
                      <option value="member">Člen</option>
                      <option value="admin">Administrátor</option>
                    </select>
                  ) : (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(member.role)}`}>
                      {getRoleText(member.role)}
                    </span>
                  )}

                  {member.role !== 'owner' && (
                    <>
                      <button
                        onClick={() => handleOpenPermissions(member)}
                        className="text-[#0a192f] hover:bg-gray-100 p-2 rounded-lg transition"
                        title="Upravit oprávnění"
                      >
                        <Shield className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"
                        title="Odebrat člena"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showPermissionsModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-[#0a192f]">
                Oprávnění pro {selectedMember.user?.full_name || selectedMember.user?.email || 'Neznámý uživatel'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              {resourceSections.map(({ key, label }) => {
                const perms = permissionsForm[key];
                return (
                  <div key={key} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">{label}</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms?.can_view}
                        onChange={(e) =>
                          setPermissionsForm(prev => ({
                            ...prev,
                            [key]: { ...prev[key], can_view: e.target.checked }
                          }))
                        }
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Zobrazit</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms?.can_create}
                        onChange={(e) =>
                          setPermissionsForm(prev => ({
                            ...prev,
                            [key]: { ...prev[key], can_create: e.target.checked }
                          }))
                        }
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Vytvořit</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms?.can_edit}
                        onChange={(e) =>
                          setPermissionsForm(prev => ({
                            ...prev,
                            [key]: { ...prev[key], can_edit: e.target.checked }
                          }))
                        }
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Upravit</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms?.can_delete}
                        onChange={(e) =>
                          setPermissionsForm(prev => ({
                            ...prev,
                            [key]: { ...prev[key], can_delete: e.target.checked }
                          }))
                        }
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Smazat</span>
                    </label>
                  </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleSavePermissions}
                className="px-6 py-2 bg-[#0a192f] text-white rounded-lg hover:bg-opacity-90 transition"
              >
                Uložit oprávnění
              </button>
              <button
                onClick={() => {
                  setShowPermissionsModal(false);
                  setSelectedMember(null);
                }}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
