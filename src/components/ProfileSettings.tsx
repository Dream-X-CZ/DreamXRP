import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { InvitationWithOrganization } from '../types/database';
import { Check, X } from 'lucide-react';

interface ProfileFormState {
  full_name: string;
  phone: string;
  position: string;
  bio: string;
  avatar_url: string;
}

interface ProfileSettingsProps {
  pendingInvitations: InvitationWithOrganization[];
  onAcceptInvitation: (invitationId: string) => Promise<void>;
  onDeclineInvitation: (invitationId: string) => Promise<void>;
  processingInvitationId: string | null;
}

export default function ProfileSettings({
  pendingInvitations,
  onAcceptInvitation,
  onDeclineInvitation,
  processingInvitationId
}: ProfileSettingsProps) {
  const [form, setForm] = useState<ProfileFormState>({
    full_name: '',
    phone: '',
    position: '',
    bio: '',
    avatar_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Nepodařilo se načíst informace o uživateli.');
        return;
      }

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone, position, bio, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading profile settings:', profileError);
        setError('Nastavení profilu se nepodařilo načíst.');
        return;
      }

      setForm({
        full_name: data?.full_name ?? '',
        phone: data?.phone ?? '',
        position: data?.position ?? '',
        bio: data?.bio ?? '',
        avatar_url: data?.avatar_url ?? ''
      });
    } catch (err) {
      console.error('Unexpected error loading profile settings:', err);
      setError('Došlo k neočekávané chybě při načítání nastavení.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: keyof ProfileFormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setStatusMessage(null);

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Nepodařilo se ověřit uživatele.');
        return;
      }

      const { error: upsertError } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          full_name: form.full_name || null,
          phone: form.phone || null,
          position: form.position || null,
          bio: form.bio || null,
          avatar_url: form.avatar_url || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );

      if (upsertError) {
        console.error('Error saving profile settings:', upsertError);
        setError('Nastavení se nepodařilo uložit.');
        return;
      }

      setStatusMessage('Profil byl úspěšně uložen.');
    } catch (err) {
      console.error('Unexpected error saving profile settings:', err);
      setError('Došlo k chybě při ukládání profilu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Nastavení profilu</h2>
        <p className="text-gray-500 mb-6">
          Aktualizujte své osobní údaje, které se zobrazují vašemu týmu.
        </p>

        {pendingInvitations.length > 0 && (
          <div className="mb-8 rounded-xl border border-blue-100 bg-blue-50/60 p-5">
            <h3 className="text-lg font-semibold text-[#0a192f] mb-3 flex items-center gap-2">
              <span>Čekající pozvánky do týmů</span>
              <span className="inline-flex items-center justify-center rounded-full bg-[#0a192f] px-2.5 py-0.5 text-xs font-medium text-white">
                {pendingInvitations.length}
              </span>
            </h3>
            <p className="text-sm text-[#0a192f]/70 mb-4">
              Připojte se ke svému novému týmu přímo odsud. Po přijetí se objeví v nabídce profilu v horní liště.
            </p>

            <div className="space-y-4">
              {pendingInvitations.map(invitation => (
                <div
                  key={invitation.id}
                  className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-gray-900">
                        {invitation.organization?.name ?? 'Neznámá organizace'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Nabízená role: <span className="font-medium text-gray-700">{invitation.role}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Pozvánka vytvořena: {new Date(invitation.created_at).toLocaleDateString('cs-CZ')}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onDeclineInvitation(invitation.id)}
                        disabled={processingInvitationId === invitation.id}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        <X className="h-4 w-4" />
                        Odmítnout
                      </button>
                      <button
                        onClick={() => onAcceptInvitation(invitation.id)}
                        disabled={processingInvitationId === invitation.id}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#0a192f] px-4 py-2 text-white transition hover:bg-[#13294b] disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        Přijmout
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Načítání nastavení...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <p className="text-red-600">{error}</p>}
            {statusMessage && <p className="text-green-600">{statusMessage}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                  Celé jméno
                </label>
                <input
                  id="full_name"
                  type="text"
                  value={form.full_name}
                  onChange={event => handleChange('full_name', event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  placeholder="Jan Novák"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="position" className="block text-sm font-medium text-gray-700">
                  Pozice v týmu
                </label>
                <input
                  id="position"
                  type="text"
                  value={form.position}
                  onChange={event => handleChange('position', event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  placeholder="Projektový manažer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Telefon
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={event => handleChange('phone', event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  placeholder="+420 123 456 789"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="avatar_url" className="block text-sm font-medium text-gray-700">
                  URL profilové fotografie
                </label>
                <input
                  id="avatar_url"
                  type="url"
                  value={form.avatar_url}
                  onChange={event => handleChange('avatar_url', event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                Bio
              </label>
              <textarea
                id="bio"
                value={form.bio}
                onChange={event => handleChange('bio', event.target.value)}
                rows={5}
                className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a192f]"
                placeholder="Stručně popište své zkušenosti a kompetence..."
              />
              <p className="text-sm text-gray-400">Tento text se zobrazí kolegům v detailu profilu.</p>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#0a192f] text-white font-medium hover:bg-[#13294b] transition disabled:opacity-60"
              >
                {saving ? 'Ukládám...' : 'Uložit změny'}
              </button>
              <button
                type="button"
                onClick={loadProfile}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
              >
                Obnovit
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
