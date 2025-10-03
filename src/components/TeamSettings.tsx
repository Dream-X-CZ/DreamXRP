import { useState, useEffect } from 'react';
import { Plus, UserPlus, Trash2, Mail, Shield, Eye, CreditCard as Edit, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { OrganizationMember, Invitation, ResourcePermission, Organization } from '../types/database';

export default function TeamSettings() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [permissions, setPermissions] = useState<ResourcePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member' as 'admin' | 'member' | 'viewer'
  });

  const [permissionsForm, setPermissionsForm] = useState({
    budgets: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    projects: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    expenses: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    employees: { can_view: true, can_create: false, can_edit: false, can_delete: false },
    analytics: { can_view: true, can_create: false, can_edit: false, can_delete: false }
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!memberData) return;

      const [orgRes, membersRes, invitationsRes, permissionsRes] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', memberData.organization_id).single(),
        supabase.from('organization_members').select('*').eq('organization_id', memberData.organization_id),
        supabase.from('invitations').select('*').eq('organization_id', memberData.organization_id).eq('status', 'pending'),
        supabase.from('resource_permissions').select('*').eq('organization_id', memberData.organization_id)
      ]);

      if (orgRes.data) setOrganization(orgRes.data);
      if (membersRes.data) setMembers(membersRes.data);
      if (invitationsRes.data) setInvitations(invitationsRes.data);
      if (permissionsRes.data) setPermissions(permissionsRes.data);
    } catch (error) {
      console.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization) return;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const invitationPayload = {
        organization_id: organization.id,
        email: inviteForm.email,
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

      try {
        const inviteLink = `${window.location.origin}/accept-invite?token=${invitationPayload.token}`;
        const { error: emailError } = await supabase.functions.invoke('send-invite-email', {
          body: {
            email: inviteForm.email,
            organizationName: organization.name,
            role: inviteForm.role,
            invitedByEmail: user.email,
            inviteLink
          }
        });

        if (emailError) {
          console.error('Error sending invitation email via function:', emailError);
          alert('Pozvánka byla uložena, ale e-mail se nepodařilo odeslat.');
          return;
        }
      } catch (emailError) {
        console.error('Error invoking invitation email function:', emailError);
        alert('Pozvánka byla uložena, ale e-mail se nepodařilo odeslat.');
        return;
      }

      alert('Pozvánka byla odeslána!');
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
    const newPermissionsForm: any = {
      budgets: { can_view: true, can_create: false, can_edit: false, can_delete: false },
      projects: { can_view: true, can_create: false, can_edit: false, can_delete: false },
      expenses: { can_view: true, can_create: false, can_edit: false, can_delete: false },
      employees: { can_view: true, can_create: false, can_edit: false, can_delete: false },
      analytics: { can_view: true, can_create: false, can_edit: false, can_delete: false }
    };

    memberPermissions.forEach(perm => {
      newPermissionsForm[perm.resource_type] = {
        can_view: perm.can_view,
        can_create: perm.can_create,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete
      };
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
          <p className="text-gray-600 mt-1">{organization?.name}</p>
        </div>
        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 bg-[#0a192f] text-white px-6 py-3 rounded-lg hover:bg-opacity-90 transition"
        >
          <UserPlus className="w-5 h-5" />
          <span>Pozvat člena</span>
        </button>
      </div>

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
                      {member.user?.email?.charAt(0).toUpperCase() || '?'}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{member.user?.email || 'Neznámý uživatel'}</div>
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
                Oprávnění pro {selectedMember.user?.email}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              {Object.entries(permissionsForm).map(([resource, perms]) => (
                <div key={resource} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3 capitalize">{resource}</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms.can_view}
                        onChange={(e) => setPermissionsForm({
                          ...permissionsForm,
                          [resource]: { ...perms, can_view: e.target.checked }
                        })}
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Zobrazit</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms.can_create}
                        onChange={(e) => setPermissionsForm({
                          ...permissionsForm,
                          [resource]: { ...perms, can_create: e.target.checked }
                        })}
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Vytvořit</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms.can_edit}
                        onChange={(e) => setPermissionsForm({
                          ...permissionsForm,
                          [resource]: { ...perms, can_edit: e.target.checked }
                        })}
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Upravit</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={perms.can_delete}
                        onChange={(e) => setPermissionsForm({
                          ...permissionsForm,
                          [resource]: { ...perms, can_delete: e.target.checked }
                        })}
                        className="w-4 h-4 text-[#0a192f] border-gray-300 rounded focus:ring-[#0a192f]"
                      />
                      <span className="text-sm text-gray-700">Smazat</span>
                    </label>
                  </div>
                </div>
              ))}
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
