alter table public.budgets
  add column if not exists archived boolean not null default false;

alter table public.budgets
  add column if not exists archived_at timestamp with time zone;

create index if not exists budgets_archived_idx on public.budgets (archived);
