import { supabase } from './supabase';

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

export async function ensureUserOrganization(userId: string): Promise<string> {
  let organizationId = await fetchPrimaryOrganizationId(userId);

  if (organizationId) {
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

  return organizationId;
}
