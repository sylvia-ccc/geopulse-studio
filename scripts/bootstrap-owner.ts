#!/usr/bin/env node
/** Operator-only CLI; bundle for the production image with npm run build:owner. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEMO_EMAIL, getSessionSecret } from "../src/lib/auth";
import { findUserByEmail, provisionConfiguredOwner } from "../src/lib/db";

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/bootstrap-owner.cjs --credentials-file /secure/geopulse-owner.md [--migrate-demo-workspace]");
    console.log("Requires ADMIN_EMAIL, SESSION_SECRET, GEOPULSE_DATA_DIR/GEOPULSE_DB_PATH and APP_URL in the environment.");
    console.log("Creates a new owner through the application service. Existing emails are rejected; passwords are never printed.");
    return;
  }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--credentials-file") { i++; if (!args[i]) throw new Error("Missing credentials file"); }
    else if (args[i] !== "--migrate-demo-workspace") throw new Error("Unknown CLI argument");
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !z.string().email().safeParse(email).success || email === DEMO_EMAIL) {
    throw new Error("Configure ADMIN_EMAIL to the private owner email first");
  }
  getSessionSecret();
  const credentialFlag = args.indexOf("--credentials-file");
  const ledgerPath = credentialFlag >= 0 ? args[credentialFlag + 1] :
    process.platform === "darwin" ? "/Users/sss/Documents/个人私密账号台账/geopulse-studio_账号与密码台账.md" : "";
  if (!ledgerPath || !path.isAbsolute(ledgerPath)) throw new Error("Provide an absolute --credentials-file outside the application directory");
  const relative = path.relative(process.cwd(), ledgerPath);
  if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
    throw new Error("Credentials must be stored outside the application directory");
  }
  const directory = path.dirname(ledgerPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Credential directory cannot be a symbolic link");
  fs.chmodSync(directory, 0o700);
  if (findUserByEmail(email)) throw new Error("Owner email already exists; use existing login or review recovery first");

  const password = crypto.randomBytes(30).toString("base64url");
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !z.string().url().safeParse(appUrl).success) throw new Error("Configure APP_URL before recording the owner login");
  const record = (status: string) => [
    "# GeoPulse Studio 账号与密码台账", "",
    "- Platform: GeoPulse Studio private owner",
    `- Login URL: ${appUrl.replace(/\/$/, "")}/login`,
    `- Registered Email: ${email}`,
    `- Username/Handle: ${email}`,
    `- Password: ${password}`,
    "- API Key/Token storage path or status: Account API key remains in application database; SESSION_SECRET remains in server environment",
    "- Account Purpose: Private application owner; public demo identity has no protected access",
    `- Provisioning status: ${status}`,
    `- Updated: ${new Date().toISOString()}`, "",
  ].join("\n");
  // Exclusive creation prevents accidental replacement of an existing private ledger.
  // Persist credentials before the transaction, so a crash never loses the password.
  const descriptor = fs.openSync(ledgerPath, "wx", 0o600);
  try {
    fs.fchmodSync(descriptor, 0o600);
    fs.writeSync(descriptor, record("pending; verify application account before attempting recovery"));
    fs.fsyncSync(descriptor);
    const result = provisionConfiguredOwner({
      email, password, name: "GeoPulse Owner",
      migrateDemoWorkspace: args.includes("--migrate-demo-workspace"),
    });
    fs.ftruncateSync(descriptor, 0);
    fs.writeSync(descriptor, record("created successfully"), 0);
    fs.fsyncSync(descriptor);
    console.log(`Owner created. Credentials recorded privately in ${ledgerPath}`);
    console.log(`Workspace transfer counts: ${JSON.stringify(result.transferred)}`);
  } finally {
    fs.closeSync(descriptor);
  }
}

try { main(); } catch (error) {
  // Validation/service errors contain no submitted passwords, tokens or environment dumps.
  console.error(error instanceof Error ? error.message : "Owner provisioning failed");
  process.exitCode = 1;
}
