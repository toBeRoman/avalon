import type { RoleId } from "../shared/types";

/** Public URLs for Eldermere-derived art under /art. */
export const ART = {
  keyArt: "/art/style/style-reference-key-art-v3.webp",
  crown: "/art/style/canonical-crown-v2.svg",
  roleBack: "/art/backs/role-card-back-v3.webp",
  victory: "/art/campaign/victory-v3.webp",
  sabotage: "/art/campaign/sabotage-v3.webp",
  lady: "/art/roles/diviner-v3.webp",
} as const;

const ROLE_ART: Record<RoleId, string> = {
  merlin: "/art/roles/oracle-v3.webp",
  percival: "/art/roles/herald-v3.webp",
  servant: "/art/roles/knight-crown-a-v3.webp",
  assassin: "/art/roles/executioner-v3.webp",
  morgana: "/art/roles/enchantress-v3.webp",
  mordred: "/art/roles/usurper-v3.webp",
  oberon: "/art/roles/wanderer-v3.webp",
  minion: "/art/roles/cultist-a-v3.webp",
};

export function roleArt(role: RoleId): string {
  return ROLE_ART[role];
}

export function questArt(success: boolean): string {
  return success ? ART.victory : ART.sabotage;
}
