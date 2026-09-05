import { login, sessionCookieName } from "../../../../lib/tracking/auth";
import { badRequest, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = cleanText(body?.username);
  const password = cleanText(body?.password);
  if (!username || !password) return badRequest("Username and password are required");

  const result = await login(username, password);
  if (!result) return unauthorized();

  const response = json({
    user: result.principal,
    token: result.token,
    tokenRecord: {
      id: result.tokenRecord.id,
      name: result.tokenRecord.name,
      createdAt: result.tokenRecord.createdAt,
      expiresAt: result.tokenRecord.expiresAt,
    },
  });
  response.headers.append(
    "Set-Cookie",
    `${sessionCookieName}=${encodeURIComponent(result.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}
