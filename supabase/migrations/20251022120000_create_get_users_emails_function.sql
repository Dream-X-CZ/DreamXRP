-- Creates helper function to expose user email addresses to authenticated clients
-- while preserving security via a SECURITY DEFINER function.

set check_function_bodies = off;

drop function if exists public.get_users_emails(uuid[]);

create or replace function public.get_users_emails(user_ids uuid[])
returns table (user_id uuid, email text)
language sql
security definer
set search_path = auth, public, extensions
as $$
  select u.id as user_id, u.email
  from auth.users u
  where user_ids is not null
    and u.id = any(user_ids);
$$;

revoke all on function public.get_users_emails(uuid[]) from public;
grant execute on function public.get_users_emails(uuid[]) to authenticated;
grant execute on function public.get_users_emails(uuid[]) to service_role;
