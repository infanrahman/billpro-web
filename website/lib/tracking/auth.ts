import { createHash, randomBytes } from "node:crypto";
import { trackingConfig } from "./config";
import { trackingRepository } from "./repository";
import { permissionsForRole } from "./permissions";
import type { AuthTokenRecord, Permission, Role, TrackingPrincipal, UserRecord } from "./types";

const defaultCompanyId = "11111111-1111-1111-1111-111111111111";
const defaultBranchId = "00000000-0000-0000-0000-000000000000";

const bootstrapUsers: Record<string, { password: string; principal: TrackingPrincipal }> = {
  owner: {
    password: trackingConfig.bootstrapOwnerPassword,
    principal: {
      id: "owner-demo",
      name: "Owner Demo",
      role: "owner",
      companyIds: [defaultCompanyId],
      branchIds: [defaultBranchId],
      permissions: permissionsForRole("owner"),
    },
  },
  manager: {
    password: trackingConfig.bootstrapManagerPassword,
    principal: {
      id: "manager-demo",
      name: "Manager Demo",
      role: "manager",
      companyIds: [defaultCompanyId],
      branchIds: [defaultBranchId],
      permissions: permissionsForRole("manager"),
    },
  },
};

export const hashSecret = (secret: string, salt = "") =>
  createHash("sha256").update(`${salt}:${secret}`).digest("hex");

export const createPasswordHash = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return {
    passwordSalt: salt,
    passwordHash: hashSecret(password, salt),
    passwordUpdatedAt: new Date().toISOString(),
  };
};

const createTokenValue = () => `bt_${randomBytes(32).toString("hex")}`;

const userToPrincipal = (user: UserRecord): TrackingPrincipal => ({
  id: user.id,
  name: user.name,
  role: user.role,
  companyIds: user.companyIds,
  branchIds: user.branchIds,
  permissions: Array.from(new Set([...(permissionsForRole(user.role) || []), ...(user.permissions || [])])) as Permission[],
});

export const createManagedToken = async (principal: TrackingPrincipal, name = "Dashboard session", daysValid = 30) => {
  const tokenValue = createTokenValue();
  const now = new Date();
  const record: AuthTokenRecord = {
    id: crypto.randomUUID(),
    userId: principal.id,
    name,
    tokenHash: hashSecret(tokenValue),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + daysValid * 24 * 60 * 60 * 1000).toISOString(),
  };
  await trackingRepository.createAuthToken(record);
  return { token: tokenValue, record };
};

export const login = async (username: string, password: string) => {
  const normalizedUsername = username.trim().toLowerCase();
  const bootstrap = bootstrapUsers[normalizedUsername];
  if (trackingConfig.bootstrapEnabled && bootstrap && bootstrap.password === password) {
    const { token, record } = await createManagedToken(bootstrap.principal, "Bootstrap dashboard session");
    return { principal: bootstrap.principal, token, tokenRecord: record };
  }

  const user = await trackingRepository.findRecordBy<UserRecord>(
    "users",
    (record) => record.username.toLowerCase() === normalizedUsername && record.status !== "inactive",
  );
  if (!user?.passwordHash || !user.passwordSalt) return null;
  if (hashSecret(password, user.passwordSalt) !== user.passwordHash) return null;

  const principal = userToPrincipal(user);
  const { token, record } = await createManagedToken(principal);
  return { principal, token, tokenRecord: record };
};

export const authenticate = async (request: Request): Promise<TrackingPrincipal | null> => {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return null;

  if (trackingConfig.bootstrapEnabled && token === "demo-owner-token") return bootstrapUsers.owner.principal;
  if (trackingConfig.bootstrapEnabled && token === "demo-manager-token") return bootstrapUsers.manager.principal;

  const tokenRecord = await trackingRepository.getAuthTokenByHash(hashSecret(token));
  if (!tokenRecord) return null;

  const bootstrapPrincipal = Object.values(bootstrapUsers).find((user) => user.principal.id === tokenRecord.userId)?.principal;
  if (bootstrapPrincipal) return bootstrapPrincipal;

  const user = await trackingRepository.getRecord<UserRecord>("users", tokenRecord.userId);
  if (!user || user.status === "inactive") return null;
  return userToPrincipal(user);
};
