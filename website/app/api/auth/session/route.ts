import { authenticate } from "../../../../lib/tracking/auth";
import { json, unauthorized } from "../../../../lib/tracking/responses";

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  return json({
    user: principal,
  });
}
