/** Dependency graph of an event pack (for the editor and docs). */
import { formatCondition } from './dsl';
import { CompiledPack } from './validate';

export function graphEdges(
  pack: CompiledPack
): { from: string; to: string; kind: string }[] {
  const edges: { from: string; to: string; kind: string }[] = [];
  for (const ev of Object.values(pack.events)) {
    if (ev.next) edges.push({ from: ev.id, to: ev.next, kind: 'next' });
    for (const s of ev.steps) {
      if (s.do === 'goto')
        edges.push({ from: ev.id, to: s.target, kind: 'goto' });
      if (s.do === 'branch')
        s.branches.forEach(b =>
          edges.push({
            from: ev.id,
            to: b.goto,
            kind: b.when ? `if ${formatCondition(b.when)}` : `w=${b.weight}`,
          })
        );
    }
  }
  for (const g of Object.values(pack.groups))
    g.members.forEach(m =>
      edges.push({ from: g.id, to: m.event, kind: `w=${m.weight}` })
    );
  for (const s of Object.values(pack.sequences))
    s.events.forEach((e, i) =>
      edges.push({ from: s.id, to: e, kind: `#${i + 1}` })
    );
  return edges;
}

export function toMermaid(pack: CompiledPack): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');
  const lines = ['flowchart LR'];
  for (const ev of Object.values(pack.events)) {
    const label = `${ev.name}${ev.loop ? ` ⟳${ev.loop.times}` : ''}`.replace(
      /"/g,
      "'"
    );
    lines.push(`  ${safe(ev.id)}["${label}"]`);
  }
  for (const g of Object.values(pack.groups))
    lines.push(`  ${safe(g.id)}{{"${g.name.replace(/"/g, "'")}"}}`);
  for (const e of graphEdges(pack))
    lines.push(
      `  ${safe(e.from)} -->|${e.kind.replace(/[|"]/g, ' ').slice(0, 40)}| ${safe(e.to)}`
    );
  return lines.join('\n');
}
