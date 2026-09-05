import { authenticate } from "../../../../lib/tracking/auth";
import { canUseScope, canViewEntity } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import { forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!canViewEntity(principal, "reports")) return forbidden("Missing reports.view permission");
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") || principal.companyIds[0];
  const branchId = url.searchParams.get("branchId") || undefined;
  if (!companyId || !canUseScope(principal, companyId, branchId)) return forbidden("Scope is outside this user's companies or branches");
  const devices = await trackingRepository.getDeviceStatuses(companyId, branchId);
  const now = Date.now();
  return json({ devices: devices.map((device) => ({ ...device, status: now - new Date(device.lastSeenAt).getTime() < 10 * 60 * 1000 ? "online" : "offline" })) });
}
