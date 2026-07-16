import { readFileSync } from "node:fs";
import { join } from "node:path";

// Shared paths + fixture manifest for the Closing Center visual specs. The manifest is written
// by seed.mjs during global setup; screenshots are review evidence under an ignored artifacts dir.
export const ARTIFACTS = join(process.cwd(), "tests", "visual", ".artifacts");

export type Manifest = {
  orgId: string;
  slug: string;
  auth: { admin: string; writer: string; analyst: string };
  users: { admin: string; writer: string; analyst: string };
  opportunities: { empty: string; active: string; terminal: string };
};

export function manifest(): Manifest {
  return JSON.parse(readFileSync(join(ARTIFACTS, "fixtures.json"), "utf8"));
}

export const authFile = (role: "admin" | "writer" | "analyst") => join(ARTIFACTS, "auth", `${role}.json`);
export const shot = (name: string) => join(ARTIFACTS, "screenshots", `${name}.png`);
export const oppPath = (id: string) => `/opportunities/${id}`;

// The one stable anchor the specs hang off — the labelled Closing Center container.
export const CLOSING_CENTER = 'section[aria-labelledby="closing-center-heading"]';
