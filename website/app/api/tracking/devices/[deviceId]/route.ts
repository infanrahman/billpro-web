import { authenticate } from "../../../../../lib/tracking/auth";
import { canUseScope } from "../../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../../lib/tracking/repository";
import { badRequest, forbidden, json, unauthorized } from "../../../../../lib/tracking/responses";

export async function DELETE(request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  const { deviceId } = await context.params;
  const companyId = new URL(request.url).searchParams.get("companyId") || principal.companyIds[0];
  if (!companyId || !canUseScope(principal, companyId)) return forbidden("Scope is outside this user's companies");
  const revoked = await trackingRepository.revokeDevice(principal, decodeURIComponent(deviceId), companyId);
  return revoked ? json({ ok: true }) : badRequest("Device was not found or cannot be revoked");
}
