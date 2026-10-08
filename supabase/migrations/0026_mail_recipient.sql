-- Mailbox the return mail was sent to (e.g. workplace-it@glow25.de), shown
-- next to the mail link in the history.
alter table device_assignments add column mail_recipient text;

-- Backfill entries imported before this column existed: the recipient is
-- the authuser= parameter of the generated Gmail link.
update device_assignments
set mail_recipient = replace(substring(mail_link from 'authuser=([^#&]+)'), '%40', '@')
where mail_link is not null and mail_recipient is null;
