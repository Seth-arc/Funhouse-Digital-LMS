-- Supabase pre-deployment audit queries
-- Run this file in the Supabase SQL editor before final deployment and user testing.
-- Blocking expectation: all "must be zero rows" queries return zero rows.

-- 1) Tables in public schema without RLS enabled (must be zero rows)
with public_tables as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
)
select schema_name, table_name
from public_tables
where rls_enabled = false
order by table_name;

-- 2) RLS-enabled public tables with zero policies (must be zero rows)
with public_tables as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
),
policy_counts as (
  select
    schemaname as schema_name,
    tablename as table_name,
    count(*) as policy_count
  from pg_policies
  where schemaname = 'public'
  group by schemaname, tablename
)
select
  t.schema_name,
  t.table_name,
  coalesce(p.policy_count, 0) as policy_count
from public_tables t
left join policy_counts p
  on p.schema_name = t.schema_name
 and p.table_name = t.table_name
where t.rls_enabled = true
  and coalesce(p.policy_count, 0) = 0
order by t.table_name;

-- 3) Dangerous anon table privileges (must be zero rows)
select
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
order by table_name, privilege_type;

-- 4) Security-definer functions without explicit search_path (must be zero rows)
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'auth')
  and p.prosecdef = true
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
    where cfg like 'search_path=%'
  )
order by schema_name, function_name;

-- 5) Extension inventory (review only)
select extname, extversion
from pg_extension
order by extname;

-- 6) Policy inventory by table (review only)
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 7) Realtime publication coverage (review only)
select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;

-- 8) Unindexed foreign keys in public schema (must be zero rows for larger datasets)
with fk as (
  select
    con.oid as constraint_oid,
    con.conname as constraint_name,
    ns.nspname as schema_name,
    rel.relname as table_name,
    con.conkey as constrained_columns
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where con.contype = 'f'
    and ns.nspname = 'public'
),
fk_index_match as (
  select
    fk.constraint_oid,
    exists (
      select 1
      from pg_index idx
      where idx.indrelid = (
        select conrelid
        from pg_constraint
        where oid = fk.constraint_oid
      )
      and idx.indisvalid
      and idx.indkey::int2[] @> fk.constrained_columns
    ) as has_supporting_index
  from fk
)
select
  fk.schema_name,
  fk.table_name,
  fk.constraint_name
from fk
join fk_index_match m on m.constraint_oid = fk.constraint_oid
where m.has_supporting_index = false
order by fk.table_name, fk.constraint_name;
