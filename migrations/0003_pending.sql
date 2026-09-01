-- Incoming gifts (transfers, referral bonus) land in *_pending so a dest
-- player's autosave cannot overwrite gold that arrived while they were playing.

alter table condado_profiles add column if not exists gold_pending integer not null default 0;
alter table condado_profiles add column if not exists bread_pending integer not null default 0;
alter table condado_profiles add column if not exists niens_pending integer not null default 0;
alter table condado_profiles add column if not exists troop_cards_pending integer not null default 0;
alter table condado_profiles add column if not exists general_cards_pending integer not null default 0;
