# Light DMV App

Crew and owner app for Light DMV, built on the original ops calendar. Installable on phones (open the site, then Share > Add to Home Screen).

| Tab | Who | What |
| --- | --- | --- |
| Yard signs | everyone | 14 routes / 168 stops. Start a route, the phone tracks GPS, and inside a stop's arrival radius it pops up "You've arrived" and asks for a sign photo. Owners see every stop's status and crews' live location. |
| Jobs | everyone | Jobber visits for your crew with the install or takedown SOP checklist. Required boxes block "Mark job done"; photo boxes need a photo. Updates every 5 seconds so the whole crew sees each other's checks. |
| Calendar | owners | The original recurring task board (moved to `/calendar`). |
| People | owners, Maria | Add workers, set PINs, put people on Crew 1 / Crew 2, match them to their Jobber name. |
| Jobber | owners, Maria | Connect Jobber and sync. |

## Setup on Vercel

Environment variables (see `.env.example`):

1. `AUTH_SECRET`: any long random string.
2. `OWNER_SETUP_CODE`: a code only Chris and Liam know. The first time an owner signs in they pick a PIN and enter this code.
3. Storage tab > Create > **Blob** and connect it (sets `BLOB_READ_WRITE_TOKEN`) so photos are kept.
4. Upstash Redis is already connected for the calendar; the app uses the same database.
5. Jobber: create an app at developer.getjobber.com, callback URL `https://<your site>/api/jobber/callback`, then add `JOBBER_CLIENT_ID` and `JOBBER_CLIENT_SECRET` and press **Connect Jobber** in the app.

Redeploy after adding variables. Without Redis/Blob (local `npm run dev`) data and photos live in memory.

## Yard sign stops

The drafted stops are bundled at `data/yard-signs/yard_sign_stops.csv` and load automatically on first use. To change them, upload a new CSV on the Yard signs page (same columns). Re-importing keeps crew assignments and sign history, matched by `route_id` and `stop_id`. Each stop carries `arrival_radius_m` (GPS geofence for the photo prompt) and `photo_required`.

Phones only share location while the app is open on screen, so crews keep the route page open while driving (the app keeps the screen awake).

## SOP checklists

Defined in `lib/sops.ts`. Items marked REQUIRED and items that ask for a picture are required; picture items need a photo. Install vs takedown is read from the Jobber visit title (takedown/removal) and otherwise by month.

---

## Original: LightDMV Ops Calendar

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
