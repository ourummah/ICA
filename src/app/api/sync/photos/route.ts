import { after, NextResponse } from "next/server";

import { getDevice } from "@/lib/device/server";
import { sha256Hex } from "@/lib/records/payload";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, photoMetaSchema } from "@/lib/records/sync-schemas";
import { sealInBackground } from "@/lib/seal/background";
import { createAdminClient } from "@/lib/supabase/admin";

/** Hash mismatches are security events in the site's audit chain (docs/AUDIT_TRAIL.md). */
async function logMismatch(siteId: string, detail: Record<string, string | null>) {
  const { error } = await createAdminClient().rpc("log_security_event", {
    p_site_id: siteId,
    p_kind: "photo_hash_mismatch",
    p_detail: detail,
  });
  if (error) console.error("could not log photo hash mismatch", error.message);
}

/**
 * Accepts one photo for a synced step record. The server recomputes the SHA-256 and rejects the
 * upload if it differs from what the device computed when the photo was taken (SPEC 6, rule 5).
 */
export async function POST(request: Request) {
  const ctx = await getDevice();
  if (!ctx) return NextResponse.json({ error: "Not a registered device" }, { status: 401 });
  const { supabase, device } = ctx;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const meta = photoMetaSchema.safeParse(JSON.parse(String(form?.get("meta") ?? "null")));
  if (!meta.success || !(file instanceof File))
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Photo too large" }, { status: 413 });
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  }

  const { data: existing } = await supabase
    .from("photos")
    .select("id")
    .eq("client_photo_id", meta.data.client_photo_id)
    .maybeSingle();
  if (existing) return NextResponse.json({ status: "duplicate" });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const actual = await sha256Hex(bytes);
  if (actual !== meta.data.sha256) {
    after(() =>
      logMismatch(device.siteId, {
        reason: "bytes do not match the hash taken on the device",
        device_id: device.id,
        client_photo_id: meta.data.client_photo_id,
        expected_sha256: meta.data.sha256,
        actual_sha256: actual,
      }),
    );
    return NextResponse.json({ status: "rejected", error: "sha256 mismatch" }, { status: 422 });
  }

  const { data: record } = await supabase
    .from("step_records")
    .select("id, task_id, photo_sha256")
    .eq("client_record_id", meta.data.client_record_id)
    .eq("site_id", device.siteId)
    .maybeSingle();
  if (!record)
    return NextResponse.json({ status: "retry", error: "step record not synced yet" }, { status: 409 });
  // A record that committed to a photo hash accepts only that photo.
  if (record.photo_sha256 && record.photo_sha256 !== actual) {
    after(() =>
      logMismatch(device.siteId, {
        reason: "photo is not the one its step record committed to",
        device_id: device.id,
        client_photo_id: meta.data.client_photo_id,
        expected_sha256: record.photo_sha256,
        actual_sha256: actual,
      }),
    );
    return NextResponse.json(
      { status: "rejected", error: "photo does not match its record" },
      { status: 422 },
    );
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${device.siteId}/${record.task_id}/${meta.data.client_photo_id}.${ext}`;
  const upload = await supabase.storage
    .from("photos")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error && !/exists/i.test(upload.error.message)) {
    return NextResponse.json({ status: "rejected", error: upload.error.message }, { status: 500 });
  }

  const { error } = await supabase.from("photos").insert({
    client_photo_id: meta.data.client_photo_id,
    step_record_id: record.id,
    site_id: device.siteId,
    storage_path: path,
    sha256: meta.data.sha256,
    device_taken_at: meta.data.device_taken_at,
  });
  if (error && error.code !== "23505")
    return NextResponse.json({ status: "rejected", error: error.message }, { status: 500 });
  // A photo that arrives after its clean was sealed without it leads to an amendment.
  if (!error) after(() => sealInBackground(device.siteId));
  return NextResponse.json({ status: error ? "duplicate" : "saved" });
}
