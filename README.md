# LightDMV Ops Calendar

A shared recurring-task calendar for Chris & Liam. Month view, click any day to see/check that day's tasks. Tasks and checkmarks are stored in a shared Upstash Redis database, so both of you see the same board from any device. No login.

## Deploy (≈10 minutes)

### 1. Push to a new GitHub repo
```bash
cd lightdmv-ops
git init
git add .
git commit -m "LightDMV ops calendar"
git branch -M main
git remote add origin https://github.com/cbellamah-tech/lightdmv-ops.git
git push -u origin main
```
(Create the empty `lightdmv-ops` repo on GitHub first.)

### 2. Create the Vercel project
- Vercel → Add New → Project → import `cbellamah-tech/lightdmv-ops`.
- Framework auto-detects as Next.js. Click Deploy.
- It deploys, but tasks won't save yet — no database connected. That's step 3.

### 3. Connect the shared database (Upstash Redis)
- In the new Vercel project → **Storage** tab → **Create Database** → choose **Upstash → Redis** (from the Marketplace).
- Pick the free plan, name it (e.g. `lightdmv-ops-db`), create.
- When prompted, **connect it to this project**. Vercel auto-injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as environment variables.
- Go to **Deployments** → redeploy the latest (so it picks up the new env vars).

### 4. Done
- Open the production URL (e.g. `lightdmv-ops.vercel.app`).
- Send the same URL to Liam. You both edit the same board.
- Optional: add a custom domain like `ops.lightdmv.com` in the project's Domains tab.

## How sync works
- Every change (add/edit/delete task, check a box) saves to the shared DB immediately.
- The board re-pulls from the DB every 20 seconds, so the other person's changes show up within ~20s. It pauses pulling while you have a panel open so it never overwrites mid-edit.
- Last-write-wins. Fine for two people; if you both edit the *same* task in the same few seconds, the later save wins.

## Notes
- Seeded with a starter task set (social, GBP, ads, China orders, taxes, blog, reviews, KPI). Edit/delete freely via the pencil icon on any task.
- **Verify the tax dates.** The seed dates are placeholders — IRS quarterly estimates aren't even quarters (~Apr 15, Jun 15, Sep 15, Jan 15), and sales-tax cadence differs by state. Edit to match your actual obligations.
- Free tier is far more than enough (30K commands/day; this uses a handful per session).
