import { authenticate, hashSecret, sessionCookieName } from "../../../../lib/tracking/auth";
import { trackingRepository } from "../../../../lib/tracking/repository";
import { json, unauthorized } from "../../../../lib/tracking/responses";

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  const header = request.headers.get("authorization");
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMatch = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${sessionCookieName}=`));
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : cookieMatch ? decodeURIComponent(cookieMatch.slice(sessionCookieName.length + 1)) : "";
  const tokenRecord = await trackingRepository.getAuthTokenByHash(hashSecret(token));
  if (tokenRecord) {
    await trackingRepository.revokeAuthToken(principal.id, tokenRecord.id);
  }

  const response = json({ ok: true });
  response.headers.append("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
