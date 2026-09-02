import { authenticate, hashSecret } from "../../../../lib/tracking/auth";
import { trackingRepository } from "../../../../lib/tracking/repository";
import { json, unauthorized } from "../../../../lib/tracking/responses";

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const tokenRecord = await trackingRepository.getAuthTokenByHash(hashSecret(token));
  if (tokenRecord) {
    await trackingRepository.revokeAuthToken(principal.id, tokenRecord.id);
  }

  return json({ ok: true });
}
