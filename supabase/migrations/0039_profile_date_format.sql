alter table budget_tracker.profiles
 add column date_format text not null default 'long'
 constraint profiles_date_format_check check(date_format in ('long','mdy','dmy','iso'));
comment on column budget_tracker.profiles.date_format is 'Display only; financial dates remain ISO calendar dates.';
