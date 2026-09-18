import type { Options } from "../shared/types";

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "The point",
    body: [
      "Most of you are loyal to Arthur. A minority are Mordred's spies, and they know each other.",
      "Good wins by completing three quests. Evil wins by failing three quests — or by finding Merlin at the very end.",
    ],
  },
  {
    heading: "A round",
    body: [
      "The leader proposes a team for this quest. Everyone votes to approve or reject it, out in the open.",
      "House rule: the leader has to approve their own team. Everybody else votes freely.",
      "If the team is rejected, the leader passes to the next player and they try again. Five rejections in a row and evil wins on the spot.",
      "If it is approved, only the players on the team secretly play a card. Good must play Success. Evil may play Success or Fail.",
      "One Fail sinks the quest — except the fourth quest in a game of seven or more, which needs two.",
    ],
  },
  {
    heading: "The knife at the end",
    body: [
      "If good completes three quests, evil gets one last shot: the Assassin names the player they think is Merlin.",
      "Guess right and evil steals the win. So Merlin must steer without ever sounding like they know.",
    ],
  },
];

const ROLE_NOTES: Record<keyof Options | "merlin" | "assassin", string> = {
  merlin: "Merlin knows every evil player — except Mordred, if he is in the game. Merlin must never look certain.",
  assassin: "The Assassin is evil, and gets the final guess at Merlin if good wins three quests.",
  percival: "Percival sees Merlin and Morgana, but not which is which. Work it out, then shield the real one.",
  morgana: "Morgana is evil and appears to Percival exactly as Merlin does.",
  mordred: "Mordred is evil and is invisible to Merlin.",
  oberon: "Oberon is evil but works alone — evil cannot see him and he cannot see them.",
  lady: "The Lady of the Lake: after the second, third and fourth quests, the holder privately checks one player's loyalty, then hands the token to them. Nobody may be checked twice.",
};

export function Rules({ options }: { options?: Options }) {
  const active = (
    [
      ["merlin", true],
      ["assassin", true],
      ["percival", options?.percival ?? true],
      ["morgana", options?.morgana ?? true],
      ["mordred", options?.mordred ?? false],
      ["oberon", options?.oberon ?? false],
      ["lady", options?.lady ?? false],
    ] as [keyof typeof ROLE_NOTES, boolean][]
  ).filter(([, on]) => on);

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h4 className="font-display text-base text-ember">{section.heading}</h4>
          {section.body.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-dim">
              {line}
            </p>
          ))}
        </section>
      ))}
      <section className="space-y-2">
        <h4 className="font-display text-base text-ember">
          {options ? "In this game" : "The special roles"}
        </h4>
        <ul className="space-y-2">
          {active.map(([key]) => (
            <li key={key} className="text-sm leading-relaxed text-dim">
              {ROLE_NOTES[key]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
