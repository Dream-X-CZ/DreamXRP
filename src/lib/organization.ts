import { supabase } from './supabase';

const STORAGE_KEY = 'active_organization_id';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getStoredActiveOrganizationId(): string | null {
  if (!isBrowser()) return null;

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to read active organization from storage:', error);
    return null;
  }
}

export function setStoredActiveOrganizationId(organizationId: string | null) {
  if (!isBrowser()) return;

  try {
    if (!organizationId) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, organizationId);
    }
  } catch (error) {
    console.error('Failed to persist active organization:', error);
  }
}

async function fetchPrimaryOrganizationId(userId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0]?.organization_id ?? null;
}

async function validatePreferredOrganization(userId: string, preferredOrganizationId?: string | null) {
  if (!preferredOrganizationId) return null;

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', preferredOrganizationId)
    .maybeSingle();

  if (error) {
    console.error('Error validating preferred organization:', error);
    return null;
  }

  return data?.organization_id ?? null;
}

export async function ensureUserOrganization(
  userId: string,
  preferredOrganizationId?: string | null
): Promise<string> {
  const storedOrganizationId = preferredOrganizationId ?? getStoredActiveOrganizationId();

  const validStoredId = await validatePreferredOrganization(userId, storedOrganizationId);

  if (validStoredId) {
    setStoredActiveOrganizationId(validStoredId);
    return validStoredId;
  }

  let organizationId = await fetchPrimaryOrganizationId(userId);

  if (organizationId) {
    setStoredActiveOrganizationId(organizationId);
    return organizationId;
  }

  const { data: newOrganization, error: createOrganizationError } = await supabase
    .from('organizations')
    .insert({ name: 'Moje organizace', owner_id: userId })
    .select()
    .single();

  if (createOrganizationError && createOrganizationError.code !== '23505') {
    throw createOrganizationError;
  }

  organizationId = newOrganization?.id ?? (await fetchPrimaryOrganizationId(userId));

  if (!organizationId) {
    throw new Error('Nepodařilo se získat identifikátor organizace.');
  }

  const { error: memberError } = await supabase
    .from('organization_members')
    .upsert(
      { organization_id: organizationId, user_id: userId, role: 'owner' },
      { onConflict: 'organization_id,user_id' }
    );

  if (memberError && memberError.code !== '23505') {
    throw memberError;
  }

  setStoredActiveOrganizationId(organizationId);
  return organizationId;
}
