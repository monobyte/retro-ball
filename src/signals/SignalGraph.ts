import type { SignalLink, SignalNode } from './SignalTypes.ts';
export interface SignalGraphIssue { linkId?: string; message: string }
/** V1 circuits are acyclic. Conditions explicitly combine state inputs. */
export function validateSignalGraph(nodes: SignalNode[], links: SignalLink[]): SignalGraphIssue[] {
  const issues: SignalGraphIssue[] = [], byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) issues.push({ message: 'Duplicate signal node ID.' });
  const ids = new Set<string>(), pairs = new Set<string>(), writers = new Set<string>();
  const adjacency = new Map(nodes.map(node => [node.id, new Set<string>()]));
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  for (const link of links) {
    const source = byId.get(link.source.instanceId), target = byId.get(link.target.instanceId);
    const sourceType = source?.outputs[link.source.port], targetType = target?.inputs[link.target.port];
    const problem = (message: string) => issues.push({ linkId: link.id, message });
    if (ids.has(link.id)) problem('Duplicate signal channel ID.'); ids.add(link.id);
    if (!sourceType || !targetType) { problem('Signal must connect an existing output port to an existing input port.'); continue; }
    if (sourceType !== targetType) problem(`Signal type mismatch: ${sourceType} output cannot drive ${targetType} input.`);
    const destination = `${target!.id}:${link.target.port}`, pair = `${source!.id}:${link.source.port}>${destination}`;
    if (pairs.has(pair)) problem('Duplicate signal connection would deliver the same event twice.'); pairs.add(pair);
    if (targetType === 'boolean' && writers.has(destination)) problem('A state input needs one writer. Combine sources through an AND/OR component.');
    writers.add(destination);
    if (!adjacency.get(source!.id)!.has(target!.id)) {
      adjacency.get(source!.id)!.add(target!.id); indegree.set(target!.id, indegree.get(target!.id)! + 1);
    }
  }
  const ready = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  let visited = 0;
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const id = ready[cursor]!; visited++;
    for (const next of adjacency.get(id)!) {
      indegree.set(next, indegree.get(next)! - 1); if (indegree.get(next) === 0) ready.push(next);
    }
  }
  if (visited !== nodes.length) issues.push({ message: 'Signal feedback loop. V1 circuits must be acyclic; use an explicit timed component instead of wiring a loop.' });
  return issues;
}
