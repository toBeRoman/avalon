import type { RoleId } from "../shared/types";

/** Public URLs for Eldermere-derived art under /art. */
export const ART = {
  keyArt: "/art/style/style-reference-key-art-v3.jpg",
  crown: "/art/style/canonical-crown-v2.svg",
  roleBack: "/art/backs/role-card-back-v3.jpg",
  victory: "/art/campaign/victory-v3.jpg",
  sabotage: "/art/campaign/sabotage-v3.jpg",
  lady: "/art/roles/diviner-v3.jpg",
} as const;

const ROLE_ART: Record<RoleId, string> = {
  merlin: "/art/roles/oracle-v3.jpg",
  percival: "/art/roles/herald-v3.jpg",
  servant: "/art/roles/knight-crown-a-v3.jpg",
  assassin: "/art/roles/executioner-v3.jpg",
  morgana: "/art/roles/enchantress-v3.jpg",
  mordred: "/art/roles/usurper-v3.jpg",
  oberon: "/art/roles/wanderer-v3.jpg",
  minion: "/art/roles/cultist-a-v3.jpg",
};

export function roleArt(role: RoleId): string {
  return ROLE_ART[role];
}

export function questArt(success: boolean): string {
  return success ? ART.victory : ART.sabotage;
}
