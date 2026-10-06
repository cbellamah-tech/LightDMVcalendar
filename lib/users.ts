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

export async function listUsers(): Promise<User[]> {
  const users = await kvGet<User[]>(KEY);
  if (users) return users;
  await kvSet(KEY, SEED);
  return structuredClone(SEED);
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
