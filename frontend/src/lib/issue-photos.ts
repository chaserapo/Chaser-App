import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

const BUCKET = "farm-issue-photos";

/** Launches the photo library picker. Returns a local file URI, or null if cancelled.
 * Deliberately skips requestMediaLibraryPermissionsAsync(): without it, this uses the
 * OS's own privacy-preserving picker (PHPicker on iOS, Android's Photo Picker), which
 * only hands back the photo the user actually picks and needs no broad gallery-access
 * permission grant at all — exactly what Google Play's photo/video permissions policy
 * expects apps with this simple pick-one-photo use case to use. */
export async function pickIssuePhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

/** Uploads a local image to the fault-report photo bucket and returns its public URL. */
export async function uploadIssuePhoto(businessId: string, issueId: string, localUri: string): Promise<string> {
  const ext = localUri.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${businessId}/${issueId}.${ext}`;
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
