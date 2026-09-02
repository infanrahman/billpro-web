import os from "node:os";
import path from "node:path";

const truthy = (value: string | undefined) => value === "1" || value === "true" || value === "yes";
const runtimeDataDir = process.env.VERCEL ? os.tmpdir() : path.join(process.cwd(), ".data");

export const trackingConfig = {
  appName: process.env.BILLING_TRACKING_APP_NAME || "Billing Pro Tracking",
  publicUrl: process.env.NEXT_PUBLIC_BILLING_TRACKING_URL || "http://127.0.0.1:3000",
  databasePath: process.env.BILLING_TRACKING_SQLITE_PATH || path.join(runtimeDataDir, "tracking.sqlite"),
  legacyJsonPath: process.env.BILLING_TRACKING_LEGACY_JSON_PATH || path.join(runtimeDataDir, "tracking-db.json"),
  bootstrapEnabled: process.env.NODE_ENV !== "production" || truthy(process.env.BILLING_TRACKING_BOOTSTRAP_ENABLED),
  bootstrapOwnerPassword: process.env.BILLING_TRACKING_BOOTSTRAP_OWNER_PASSWORD || "owner123",
  bootstrapManagerPassword: process.env.BILLING_TRACKING_BOOTSTRAP_MANAGER_PASSWORD || "manager123",
};
