import { kvGet, kvSet } from "./store";
import { SITE } from "./website";

/* Pages and blog posts waiting to go live on lightdmv.com: open pull requests in the website's (private) repo that add
   a page or a blog post. Needs a read-only GitHub token, pasted once by an owner (or GITHUB_SITE_TOKEN in Vercel). */

const REPO = process.env.SITE_REPO?.trim() || "cbellamah-tech/lightdmv-site";
const TOKEN = "ldmv:site:github";
const SNAP = "ldmv:site:drafts";

export type Draft = {
  pr: number; prUrl: string; title: string; kind: "blog" | "city" | "page"; path?: string;
  preview?: string; image?: string; date?: string; excerpt?: string; openedAt: string; draft: boolean;
};
export type Drafts = { at: number; items: Draft[]; error?: string };

async function token() {
  return process.env.GITHUB_SITE_TOKEN?.trim() || (await kvGet<{ token: string }>(TOKEN))?.token || null;
}
export const draftsConfigured = async () => !!(await token());
export const getDrafts = () => kvGet<Drafts>(SNAP);

async function gh<T = any>(path: string, t: string): Promise<T> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${t}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${j?.message ?? "request failed"}`);
  return j as T;
}

/** Check a pasted token can read the website repo, then keep it server-side. */
export async function saveSiteToken(t: string, by: string) {
  const repo = await gh(`/repos/${REPO}`, t.trim());
  await kvSet(TOKEN, { token: t.trim(), by, at: Date.now() });
  return { repo: repo.full_name as string };
}

const field = (patch: string, name: string) => patch.match(new RegExp(`^\\+\\s*${name}:\\s*["'\`]([^"'\`]+)["'\`]`, "m"))?.[1];

/** What one open pull request would publish, or null when it only edits existing pages. */
export async function draftOf(pr: any, t: string): Promise<Draft | null> {
  const files: any[] = await gh(`/repos/${REPO}/pulls/${pr.number}/files?per_page=100`, t);
  const added = files.filter((f) => f.status === "added" && /^src\/app\/(.+\/)?page\.tsx$/.test(f.filename) && !/\[/.test(f.filename));
  const blog = files.find((f) => f.filename === "src/data/blog.ts" && f.patch && /^\+\s*slug:/m.test(f.patch));
  if (!added.length && !blog) return null;
  const base = { pr: pr.number, prUrl: pr.html_url, openedAt: String(pr.created_at).slice(0, 10), draft: !!pr.draft };
  let d: Draft;
  if (blog) {
    const slug = field(blog.patch, "slug");
    const image = field(blog.patch, "image");
    d = { ...base, kind: "blog", title: field(blog.patch, "title") || pr.title.replace(/^blog:\s*/i, ""), path: slug ? `/blog/${slug}` : undefined,
      date: field(blog.patch, "date"), excerpt: field(blog.patch, "excerpt"), image: image ? `${SITE}${image}` : undefined };
  } else {
    const path = added[0].filename.replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/";
    d = { ...base, kind: /lighting\/[a-z-]+-(va|md|dc)$/.test(path) ? "city" : "page", path,
      title: pr.title.replace(/\s*\(\/[^)]+\)\s*$/, "").replace(/^Add\s+/i, "") };
  }
  // The preview Vercel builds for the pull request (its bot comment carries the link).
  const comments: any[] = await gh(`/repos/${REPO}/issues/${pr.number}/comments?per_page=50`, t).catch(() => []);
  for (const c of comments.reverse()) {
    const m = String(c.body ?? "").match(/\[Preview\]\((https:\/\/[^)\s]+)\)/);
    if (m) { d.preview = d.path ? `${m[1].replace(/\/$/, "")}${d.path}` : m[1]; break; }
  }
  return d;
}

export async function refreshDrafts(): Promise<Drafts | null> {
  const t = await token();
  if (!t) return null;
  const cur = await getDrafts();
  try {
    const prs: any[] = await gh(`/repos/${REPO}/pulls?state=open&per_page=60&sort=created&direction=desc`, t);
    const items: Draft[] = [];
    for (let i = 0; i < prs.length; i += 6) {
      const got = await Promise.all(prs.slice(i, i + 6).map((p) => draftOf(p, t).catch(() => null)));
      items.push(...got.filter((x): x is Draft => !!x));
    }
    const next = { at: Date.now(), items };
    await kvSet(SNAP, next);
    return next;
  } catch (e: any) {
    const next = { at: Date.now(), items: cur?.items ?? [], error: e.message };
    await kvSet(SNAP, next);
    return next;
  }
}
