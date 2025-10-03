import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ProfileRecord {
  full_name?: string | null;
  phone?: string | null;
  position?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  updated_at?: string | null;
}

export default function Profile() {
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
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

      setUserEmail(user.email ?? '');
      setUserId(user.id);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone, position, bio, avatar_url, updated_at')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error loading profile:', profileError);
        setError('Profil se nepodařilo načíst.');
        setProfile(null);
      } else {
        setProfile(profileData ?? null);
      }
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
      setError('Došlo k neočekávané chybě při načítání profilu.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <p className="text-gray-500">Načítání profilu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-red-100">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={loadProfile}
          className="px-4 py-2 rounded-lg bg-[#0a192f] text-white hover:bg-[#13294b] transition"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  const initials = profile?.full_name
    ?.split(' ')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-[#0a192f] text-white flex items-center justify-center text-2xl font-semibold">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Profilová fotografie"
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span>{initials || 'PR'}</span>
          )}
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            {profile?.full_name || 'Nezadané jméno'}
          </h2>
          <p className="text-gray-500">{profile?.position || 'Bez pozice'}</p>
          <p className="text-gray-400 text-sm mt-2">{userEmail}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Kontaktní údaje</h3>
          <dl className="space-y-3 text-gray-600">
            <div>
              <dt className="text-sm text-gray-400">Email</dt>
              <dd className="text-base">{userEmail || 'Neuvedeno'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Telefon</dt>
              <dd className="text-base">{profile?.phone || 'Neuvedeno'}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Informace</h3>
          <dl className="space-y-3 text-gray-600">
            <div>
              <dt className="text-sm text-gray-400">Pozice</dt>
              <dd className="text-base">{profile?.position || 'Neuvedeno'}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">ID uživatele</dt>
              <dd className="text-base break-all">{userId}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-400">Poslední aktualizace</dt>
              <dd className="text-base">
                {profile?.updated_at
                  ? new Date(profile.updated_at).toLocaleString('cs-CZ')
                  : 'Neuvedeno'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Bio</h3>
        <p className="text-gray-600 whitespace-pre-wrap">
          {profile?.bio?.trim() || 'Ještě jste si nenapsali bio.'}
        </p>
      </div>
    </div>
  );
}
