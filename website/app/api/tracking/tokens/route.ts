import { authenticate, createManagedToken, hashSecret } from "../../../../lib/tracking/auth";
import { trackingRepository } from "../../../../lib/tracking/repository";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const publicToken = (token: {
  id: string;
  name: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
}) => ({
  id: token.id,
  name: token.name,
  createdAt: token.createdAt,
  expiresAt: token.expiresAt,
  revokedAt: token.revokedAt,
  lastUsedAt: token.lastUsedAt,
});

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  const tokens = await trackingRepository.getAuthTokensForUser(principal.id);
  return json({ tokens: tokens.map(publicToken) });
}

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (principal.role !== "owner" && !principal.permissions.includes("users.update")) {
    return forbidden("Missing token management permission");
  }

  const body = await request.json().catch(() => null);
  const name = cleanText(body?.name) || "API token";
  const daysValid = Math.min(Math.max(Number(body?.daysValid || 30), 1), 365);
  const created = await createManagedToken(principal, name, daysValid);

  return json({
    token: created.token,
    tokenRecord: publicToken(created.record),
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  if (!id) return badRequest("Token id is required");

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const activeToken = await trackingRepository.getAuthTokenByHash(hashSecret(token));
  if (activeToken?.id === id) return badRequest("Use logout to revoke the active browser session");

  const revoked = await trackingRepository.revokeAuthToken(principal.id, id);
  if (!revoked) return badRequest("Token was not found");
  return json({ ok: true, token: publicToken(revoked) });
}
