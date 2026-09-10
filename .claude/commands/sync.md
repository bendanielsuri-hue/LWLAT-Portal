---
description: Pull from GitHub, migrate, reseed all demo data, and start the dev server
---

Bring this clone up to date and leave the dev server running. Do it in this order
(each step depends on the previous one):

1. `git pull`
2. `.venv\Scripts\python.exe manage.py migrate`
3. Run every seed command, in this order (all idempotent, so reruns are safe):

```
seed_dummy_data
seed_schools
seed_benjamin_admin
seed_modules
seed_staff_groups
seed_student_history
seed_safeguarding_notes
seed_term_dates
seed_referral_questions
seed_panel_groups
seed_demo_referrals
seed_panel_meetings
seed_referral_actions
seed_escalations
seed_benjamin_referral_demo
```

   Order matters: the `core` ones (through `seed_term_dates`) come first because the
   panel seeds below them need Staff/Student/School rows to exist. See the seed notes
   in the root `CLAUDE.md` and `hubs/inclusion/panel/CLAUDE.md` for per-command
   dependencies.

   If a new `seed_*` management command has been added since this file was written
   (check `**/management/commands/seed_*.py`), include it and update this list.

4. Start the server in the background and **leave it running** — the user checks
   changes in the browser themselves:
   `.venv\Scripts\python.exe manage.py runserver`

Report concisely: what the pull brought in, any non-zero seed creations, and the
server URL. Don't dump full seed output.
