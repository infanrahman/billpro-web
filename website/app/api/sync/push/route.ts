import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { SyncPushPayload } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "sales.sync")) return forbidden("Missing sync permission");

  const payload = (await request.json().catch(() => null)) as SyncPushPayload | null;
  if (!payload?.deviceId || !payload.batchId || !payload.scope?.companyId || !payload.changes || typeof payload.changes !== "object") {
    return badRequest("Expected deviceId, batchId, scope.companyId, and changes");
  }

  if (!canUseScope(principal, payload.scope.companyId, payload.scope.branchId)) {
    return forbidden("Scope is outside this user's companies or branches");
  }

  return json(await trackingRepository.applySyncPush(principal, payload));
}
