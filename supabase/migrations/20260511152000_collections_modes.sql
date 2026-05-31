drop index if exists token_index_set_path_unique;

alter table token_index
  add column if not exists mode_id text not null default 'default';

alter table token_sets
  add column if not exists modes text,
  add column if not exists mode_roots text,
  add column if not exists active_mode_id text;

alter table theme_sets
  add column if not exists mode_id text not null default 'default';

drop index if exists theme_sets_theme_set_unique;

create unique index if not exists token_index_set_mode_path_unique
  on token_index using btree (set_id, mode_id, path);

create unique index if not exists theme_sets_theme_set_mode_unique
  on theme_sets using btree (theme_id, set_id, mode_id);
