-- Condado game profiles, ledger and weekly ranking.
-- Per-user rows always carry user_id TEXT. Resources live in columns so
-- transfers stay consistent even if save_json is briefly stale.

create table if not exists condado_profiles (
  user_id text primary key,
  player_id text not null unique,
  nick text not null,
  gold integer not null default 8000,
  bread integer not null default 400,
  niens integer not null default 1,
  troop_cards integer not null default 2,
  general_cards integer not null default 0,
  county_level integer not null default 1,
  week_stars integer not null default 0,
  week_key text not null default '',
  referred_by text,
  referral_claimed boolean not null default false,
  save_json text not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists condado_profiles_nick_lower on condado_profiles (lower(nick));
create index if not exists condado_profiles_week on condado_profiles (week_key, week_stars desc);

create table if not exists condado_transfers (
  id text primary key,
  from_user_id text not null,
  from_player_id text not null,
  from_nick text not null,
  to_player_id text not null,
  to_nick text not null,
  kind text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

create index if not exists condado_transfers_from on condado_transfers (from_player_id, created_at desc);
create index if not exists condado_transfers_to on condado_transfers (to_player_id, created_at desc);

create table if not exists condado_week_claims (
  user_id text not null,
  week_key text not null,
  rank integer not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_key)
);
