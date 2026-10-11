import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { kvGet, kvSet } from "./store";
import type { Role } from "./session";

export type User = {
  id: string;
  name: string;
  role: Role;
  crew?: string;          // "crew1", "crew2", ... for leads and crew members
  phone?: string;
  jobberName?: string;    // how this person appears as an assigned user in Jobber
  pinHash?: string;       // scrypt salt:hash, never sent to the browser
  active: boolean;
};
export type PublicUser = Omit<User, "pinHash"> & { hasPin: boolean };

export const CREWS: Record<string, string> = { crew1: "Crew 1 (Gary)", crew2: "Crew 2 (Sayed)" };

const KEY = "ldmv:users";

// Team as chris described it on 2026-10-06. Full crew list comes later; add people on the People page.
const SEED: User[] = [
  { id: "chris", name: "Chris", role: "owner", active: true },
  { id: "liam", name: "Liam", role: "owner", active: true },
  { id: "maria", name: "Maria", role: "manager", active: true },
  { id: "gary", name: "Gary", role: "lead", crew: "crew1", jobberName: "Gary", active: true },
  { id: "sayed", name: "Sayed", role: "lead", crew: "crew2", jobberName: "Sayed", active: true },
];

// The yard sign placer login chris asked for on 2026-10-11, added once (an owner can rename it, change the PIN or remove it on People).
const SIGN_PLACER: User = { id: "signplacer", name: "Sign placer", role: "signs", pinHash: "67cd4051b872331ca36597c98901b542:0c189c6321df297bacbca6cf42735e6e8c6c35219af7fd5170daaf83d86f041d", active: true };
const SIGN_PLACER_ADDED = "ldmv:seed:signplacer";

export async function listUsers(): Promise<User[]> {
  let users = await kvGet<User[]>(KEY);
  if (!users) { users = structuredClone(SEED); await kvSet(KEY, users); }
  if (!(await kvGet<number>(SIGN_PLACER_ADDED))) {
    if (!users.some((u) => u.id === SIGN_PLACER.id)) { users.push({ ...SIGN_PLACER }); await kvSet(KEY, users); }
    await kvSet(SIGN_PLACER_ADDED, Date.now());
  }
  return users;
}

export async function saveUsers(users: User[]) {
  await kvSet(KEY, users);
}

export const toPublic = ({ pinHash, ...u }: User): PublicUser => ({ ...u, hasPin: !!pinHash });

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function checkPin(pin: string, stored?: string) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const validPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4,8}$/.test(pin);

export const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "user";
