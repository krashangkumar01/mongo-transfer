// src/app/api/features/route.js
import { getFeatureStatus } from "@/lib/features.js";

export async function GET() {
  const features = getFeatureStatus();
  return Response.json({ success: true, features });
}

