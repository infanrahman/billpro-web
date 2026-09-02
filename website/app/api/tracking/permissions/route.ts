import { authenticate } from "../../../../lib/tracking/auth";
import { allPermissions, rolePermissions } from "../../../../lib/tracking/permissions";
import { json, unauthorized } from "../../../../lib/tracking/responses";

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  return json({
    roles: rolePermissions,
    permissions: allPermissions,
  });
}
