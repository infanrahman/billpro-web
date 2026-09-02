import { login } from "../../../../lib/tracking/auth";
import { badRequest, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = cleanText(body?.username);
  const password = cleanText(body?.password);
  if (!username || !password) return badRequest("Username and password are required");

  const result = await login(username, password);
  if (!result) return unauthorized();

  return json({
    user: result.principal,
    token: result.token,
    tokenRecord: {
      id: result.tokenRecord.id,
      name: result.tokenRecord.name,
      createdAt: result.tokenRecord.createdAt,
      expiresAt: result.tokenRecord.expiresAt,
    },
  });
}
