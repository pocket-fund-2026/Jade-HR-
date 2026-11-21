## What and why
<!-- One feature or fix per PR. If it needs two PRs, make two. -->

## Company / product check
- [ ] This is for **JADE HR** (not Pocket Fund or another product)

## Database
- [ ] No SQL needed
- [ ] SQL needed. Files: `sql/NNN_*.sql` and, if the standby needs it, `ops/ha/*`. Applied to: [ ] primary  [ ] standby
- [ ] Code works (or fails safe) if the SQL has not been run yet

## Tests
- [ ] Backend tests added or updated (`backend/tests`)
- [ ] `vite build` passes
- [ ] Anything that sends email is covered: a mail failure must not fail the request

## Deploy notes
<!-- Pushing to main deploys to production. Anything HR must do after deploy? -->
