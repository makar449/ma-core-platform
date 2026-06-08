import type { AgentEnvelope } from "@ma-core/shared";

export type LiveEventListener = (envelope: AgentEnvelope) => void;

export class LiveEventHub {
  private readonly listeners = new Set<LiveEventListener>();

  public subscribe(listener: LiveEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(envelope: AgentEnvelope): void {
    for (const listener of this.listeners) {
      listener(envelope);
    }
  }
}
