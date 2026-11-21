/** Plain-text projection for table cells and previews: strips any HTML tags (legacy copy may still carry anchors). */
export function stripTags(value: string | undefined | null): string {
  if (!value) return "";
  return String(value).replace(/<[^>]*>/g, "");
}
