/** Shared vocabulary between the Worker (authority) and the browser (display only). */

export type Side = "good" | "evil";

export type RoleId =
  | "merlin"
  | "percival"
  | "servant"
  | "assassin"
  | "morgana"
  | "mordred"
  | "oberon"
  | "minion";

export type OptionId = "percival" | "morgana" | "mordred" | "oberon" | "lady";

export type Options = Record<OptionId, boolean>;

export type Phase =
  | "lobby"
  | "roleReveal"
  | "proposal"
  | "vote"
  | "voteReveal"
  | "quest"
  | "questReveal"
  | "lady"
  | "ladyReveal"
  | "assassin"
  | "ended";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
}

export interface QuestRecord {
  round: number;
  team: string[];
  fails: number;
  success: boolean;
  /** Who played what. Withheld from every view until the game is over. */
  cards: Record<string, boolean>;
}

export interface Proposal {
  round: number;
  attempt: number;
  leaderId: string;
  team: string[];
  /** playerId -> approved. Never sent to clients before every vote is in. */
  votes: Record<string, boolean>;
  approved?: boolean;
}

export type LogEntry =
  | {
      k: "proposal";
      round: number;
      attempt: number;
      leaderId: string;
      team: string[];
      votes: Record<string, boolean>;
      approved: boolean;
    }
  | {
      k: "quest";
      round: number;
      team: string[];
      fails: number;
      success: boolean;
      cards: Record<string, boolean>;
    }
  /** The result of a Lady of the Lake inspection is private to the holder, so it is not logged. */
  | { k: "lady"; round: number; holderId: string; targetId: string }
  | { k: "hammer"; round: number }
  | { k: "assassin"; assassinId: string; targetId: string; correct: boolean };

export interface LadyFinding {
  targetId: string;
  result: Side;
  round: number;
}

export interface LadyState {
  holderId: string;
  /** Everyone who has ever held the token; they can never be inspected. */
  visited: string[];
  targetId?: string;
  result?: Side;
}

export interface GameState {
  roles: Record<string, RoleId>;
  /** Seating order. Leader rotates through this. */
  order: string[];
  leaderIdx: number;
  round: number;
  /** 1..5. attempt 5 rejected ends the game. */
  attempt: number;
  quests: QuestRecord[];
  proposal: Proposal | null;
  /** playerId -> played success. Never revealed individually. */
  questCards: Record<string, boolean>;
  lady: LadyState | null;
  /** Private per-holder record of what the Lady of the Lake revealed to them. */
  ladyFindings: Record<string, LadyFinding[]>;
  assassinTargetId: string | null;
  log: LogEntry[];
  outcome: { winner: Side; reason: string } | null;
  /** Players who have tapped through the current reveal screen. */
  acks: string[];
}

/** Kept across games in the same room, for the night's bragging rights. */
export interface Scoreboard {
  games: number;
  good: number;
  evil: number;
  /** playerId -> games played and games their side won. */
  players: Record<string, { played: number; won: number }>;
}

export interface Insight {
  tone: "neutral" | "good" | "evil" | "warn";
  text: string;
}

export interface RoomState {
  code: string;
  hostId: string;
  players: Player[];
  /** Secret per-player tokens. Never leaves the Durable Object. */
  tokens: Record<string, string>;
  options: Options;
  phase: Phase;
  game: GameState | null;
  /** A seat the host has released so a replacement phone can claim it. */
  claim: { playerId: string; code: string } | null;
  scores: Scoreboard;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/* What a single player is allowed to see                              */
/* ------------------------------------------------------------------ */

export interface Knowledge {
  /** Player ids this role can see, in seat order so ordering leaks nothing. */
  ids: string[];
  label: string;
}

export interface SelfView {
  id: string;
  name: string;
  isHost: boolean;
  role: RoleId | null;
  side: Side | null;
  hint: string | null;
  knowledge: Knowledge | null;
  /** Set during the quest phase if you are on the team and have not played a card. */
  mayFail: boolean;
  hasPlayedCard: boolean;
}

export interface GameView {
  round: number;
  attempt: number;
  leaderId: string;
  order: string[];
  teamSize: number;
  failsRequired: number;
  quests: QuestRecord[];
  /** Team sizes for all five quests, for the board. */
  board: { size: number; failsRequired: number }[];
  proposal: { leaderId: string; team: string[]; voted: string[] } | null;
  /** Populated only once voting has closed. */
  voteResult: { team: string[]; votes: Record<string, boolean>; approved: boolean } | null;
  questResult: QuestRecord | null;
  played: string[];
  lady: { holderId: string; visited: string[]; targetId?: string; result?: Side } | null;
  /** Only your own findings. */
  ladyFindings: LadyFinding[];
  log: LogEntry[];
  outcome: { winner: Side; reason: string } | null;
  /** Only at game end. */
  reveal: Record<string, RoleId> | null;
  acks: string[];
  /** Your own vote and quest card while they can still be changed. */
  yourVote: boolean | null;
  yourCard: boolean | null;
}

export interface View {
  code: string;
  phase: Phase;
  players: Player[];
  hostId: string;
  options: Options;
  you: SelfView;
  game: GameView | null;
  waitingOn: string[];
  waitingLabel: string | null;
  scores: Scoreboard;
  /** Derived from your own role. Kept behind the hold-to-reveal card. */
  insights: Insight[];
  /** Deductions anyone at the table could make. Safe to show openly. */
  tableInsights: Insight[];
  claim: { playerId: string; code: string } | null;
}

/* ------------------------------------------------------------------ */
/* Wire protocol                                                       */
/* ------------------------------------------------------------------ */

export type ClientMessage =
  | { t: "setOptions"; options: Partial<Options> }
  | { t: "start" }
  | { t: "ack" }
  | { t: "force" }
  | { t: "propose"; team: string[] }
  | { t: "vote"; approve: boolean }
  | { t: "quest"; success: boolean }
  | { t: "lady"; targetId: string }
  | { t: "assassinate"; targetId: string }
  | { t: "playAgain" }
  | { t: "abandon" }
  | { t: "rename"; name: string }
  | { t: "kick"; playerId: string }
  | { t: "transferHost"; playerId: string }
  | { t: "releaseSeat"; playerId: string }
  | { t: "cancelClaim" };

export type ServerMessage =
  | { t: "view"; view: View }
  | { t: "error"; message: string };
