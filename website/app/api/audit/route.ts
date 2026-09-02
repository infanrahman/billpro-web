import { authenticate } from "../../../lib/tracking/auth";
import { canUseScope, canViewEntity } from "../../../lib/tracking/permissions";
import { trackingRepository } from "../../../lib/tracking/repository";
import { forbidden, json, unauthorized } from "../../../lib/tracking/responses";

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!canViewEntity(principal, "audit")) return forbidden("Missing audit.view permission");

  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") || principal.companyIds[0];
  const branchId = url.searchParams.get("branchId") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 250);

  if (!canUseScope(principal, companyId, branchId)) {
    return forbidden("Scope is outside this user's companies or branches");
  }

  return json({
    audit: await trackingRepository.getAudit(companyId, branchId, limit),
  });
}
