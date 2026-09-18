import { useState } from "react";
import type { ClientMessage, View } from "../../shared/types";
import { roleArt } from "../art";
import { RoleCard } from "../game";
import { Button, HoldToReveal, Note, Screen, Sticky, Title } from "../ui";

export default function Reveal({
  view,
  send,
}: {
  view: View;
  send: (message: ClientMessage) => void;
}) {
  const [seen, setSeen] = useState(false);
  const acked = view.game!.acks.includes(view.you.id);
  const waiting = view.waitingOn.length;

  return (
    <Screen>
      <Title sub="Press and hold the card. Let go and it hides again — so keep it flat on your knee, not out in the open.">
        Your role
      </Title>

      <HoldToReveal
        art={view.you.role ? roleArt(view.you.role) : undefined}
        onFirstReveal={() => setSeen(true)}
      >
        <RoleCard view={view} />
      </HoldToReveal>

      <Sticky>
        {acked ? (
          <Note>
            {waiting
              ? `Waiting for ${waiting} more ${waiting === 1 ? "person" : "people"} to look.`
              : "Everyone has looked."}
          </Note>
        ) : (
          <Button disabled={!seen} onClick={() => send({ t: "ack" })}>
            {seen ? "Got it" : "Hold the card first"}
          </Button>
        )}
        <Note>You can open your card again any time from the bar at the bottom.</Note>
      </Sticky>
    </Screen>
  );
}
