import type { ChatSource } from "./backend-sessions.ts";
type Node = { type: string; value?: string; url?: string; children?: Node[] };
/** Only labels backed by this turn's source list become links; code and existing links stay intact. */
export function citationPlugin(sources: ChatSource[]) {
  const labels = new Set(sources.map(source => source.title.match(/^([FK]\d+)\s*[·•]/)?.[1]).filter(Boolean));
  return () => (tree: Node) => {
    function visit(node: Node) {
      if (!node.children || ["link", "code", "inlineCode"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { visit(child); return [child]; }
        const parts: Node[] = []; let cursor = 0;
        for (const match of child.value.matchAll(/\[([FK]\d+)\]/g)) {
          if (!labels.has(match[1])) continue;
          if (match.index > cursor) parts.push({ type: "text", value: child.value.slice(cursor, match.index) });
          parts.push({ type: "link", url: `#citation-${match[1]}`, children: [{ type: "text", value: match[0] }] }); cursor = match.index + match[0].length;
        }
        if (!cursor) return [child];
        if (cursor < child.value.length) parts.push({ type: "text", value: child.value.slice(cursor) });
        return parts;
      });
    }
    visit(tree);
  };
}
