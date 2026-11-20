import type { JobKind } from "./types";
import { catalogIntelligencePath } from "@/lib/product-modules";

const KIND_LABEL: Record<JobKind, string> = {
  catalog: "Catalog Intelligence",
  gallery: "Products Gallery",
  visualizer: "Products Visualizer",
  mr_extract: "Market Research",
  mr_stage1: "Market Research",
  mr_classify: "Market Research",
  mr_collections: "Market Research",
};

export function jobKindLabel(kind: JobKind): string {
  return KIND_LABEL[kind];
}

export function jobHref(params: {
  kind: JobKind;
  workspaceSlug: string;
  sessionId: string;
}): string {
  const slug = params.workspaceSlug.replace(/^\/+|\/+$/g, "");
  if (params.kind === "catalog") {
    return catalogIntelligencePath(slug, params.sessionId);
  }
  if (params.kind === "gallery") {
    return `/w/${slug}/products-gallery?project=${encodeURIComponent(params.sessionId)}`;
  }
  if (
    params.kind === "mr_extract" ||
    params.kind === "mr_stage1" ||
    params.kind === "mr_classify" ||
    params.kind === "mr_collections"
  ) {
    return `/w/${slug}/market-research`;
  }
  return `/w/${slug}/products-visualizer?project=${encodeURIComponent(params.sessionId)}`;
}
