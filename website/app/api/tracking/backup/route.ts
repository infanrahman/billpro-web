import { authenticate } from "../../../../lib/tracking/auth";
import { can } from "../../../../lib/tracking/permissions";
import { trackingRepository, type TrackingBackup } from "../../../../lib/tracking/repository";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "backup.create")) return forbidden("Missing backup.create permission");

  const backup = await trackingRepository.exportBackup();
  return Response.json(backup, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="billing-pro-web-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "backup.restore")) return forbidden("Missing backup.restore permission");

  const body = await request.json().catch(() => null) as TrackingBackup | null;
  if (!body?.schemaVersion || !body.entities) return badRequest("Expected a tracking backup JSON payload");

  try {
    return json(await trackingRepository.restoreBackup(principal, body));
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Unable to restore backup");
  }
}
