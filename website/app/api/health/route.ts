import { json } from "../../../lib/tracking/responses";
import { trackingConfig } from "../../../lib/tracking/config";
import { trackingRepository } from "../../../lib/tracking/repository";

export const runtime = "nodejs";

export async function GET() {
  const storage = await trackingRepository.getStorageStatus();

  return json({
    status: "ok",
    service: "billing-web-tracking",
    appName: trackingConfig.appName,
    publicUrl: trackingConfig.publicUrl,
    auth: {
      bootstrapEnabled: trackingConfig.bootstrapEnabled,
      managedTokens: true,
    },
    storage: {
      driver: storage.driver,
      counts: storage.counts,
    },
    time: new Date().toISOString(),
  });
}
