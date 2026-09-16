import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

const BUCKET = "farm-issue-photos";

/** Launches the photo library picker. Returns a local file URI, or null if cancelled. */
export async function pickIssuePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Photo library permission was not granted.");
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
