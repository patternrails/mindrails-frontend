import type { ChatTurn } from "./workspace-conversation.ts";
import type { SessionDeliverable } from "./session-deliverables.ts";

/** Persisted request identity wins. Legacy images use a result URL or their creation interval. */
export function imagesByTurn(turns: readonly ChatTurn[], images: readonly SessionDeliverable[]) {
  const groups = new Map<string, SessionDeliverable[]>();
  for (const image of images) {
    let turn = image.requestId ? turns.find(turn => turn.id === image.requestId) : undefined;
    if (!image.requestId) {
      turn = turns.find(turn => !!image.versionId && turn.assistant?.includes(`/versions/${image.versionId}/`)
        || turn.assistant?.includes(image.downloadUrl));
      if (!turn) turn = turns.findLast(turn => Date.parse(turn.sentAt) <= Date.parse(image.updatedAt)) ?? turns[0];
    }
    if (!turn) continue; // Retained deliverables with expired history remain available in Details.
    const files = groups.get(turn.id) ?? []; files.push(image); groups.set(turn.id, files);
  }
  return groups;
}
