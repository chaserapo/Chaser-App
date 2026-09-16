export type IssueCategory =
  | "weed"
  | "rock"
  | "tree_branch"
  | "fix"
  | "poi"
  | "machine"
  | "water"
  | "fence"
  | "hazard";

export const ISSUE_CATEGORIES: { key: IssueCategory; label: string; icon: string }[] = [
  { key: "weed", label: "Weed", icon: "sprout" },
  { key: "rock", label: "Rock", icon: "terrain" },
  { key: "tree_branch", label: "Tree / Branch", icon: "pine-tree" },
  { key: "fix", label: "Needs Fixing", icon: "wrench" },
  { key: "poi", label: "Point of Interest", icon: "map-marker" },
  { key: "machine", label: "Machine", icon: "tractor" },
  { key: "water", label: "Water", icon: "water-alert" },
  { key: "fence", label: "Fence / Gate", icon: "gate" },
  { key: "hazard", label: "Hazard", icon: "alert-octagon" },
];

const DEFAULT_ISSUE_ICON = "map-marker-question-outline";

export function issueCategoryIcon(category: string): string {
  return ISSUE_CATEGORIES.find((c) => c.key === category)?.icon ?? DEFAULT_ISSUE_ICON;
}

export function issueCategoryLabel(category: string): string {
  return ISSUE_CATEGORIES.find((c) => c.key === category)?.label ?? category.replace(/_/g, " ");
}
