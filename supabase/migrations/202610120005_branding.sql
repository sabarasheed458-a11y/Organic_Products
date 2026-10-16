alter table store_settings add column logo_url text;
alter table store_settings add column footer_links jsonb not null default '[]';
