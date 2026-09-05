import type { LevelDocument } from './LevelDocument.ts';
import { PARTS } from './PartRegistry.ts';
import { PORT_TYPES, type SignalLink, type SignalNode } from '../signals/SignalTypes.ts';
export function signalDocument(document: LevelDocument): { nodes: SignalNode[]; links: SignalLink[] } {
  const nodes = document.instances.map(instance => {
    const part = PARTS[instance.type];
    return { id: instance.id, inputs: Object.fromEntries(part.inputs.map(port => [port, PORT_TYPES[port]])), outputs: Object.fromEntries(part.outputs.map(port => [port, PORT_TYPES[port]])) };
  });
  const links = [
    ...document.signals,
    ...document.instances.flatMap(instance => instance.links.map((link, index) => ({
      id: `inline/${instance.id}/${index}`, source: { instanceId: instance.id, port: link.output }, target: { instanceId: link.target.instanceId, port: link.target.input },
    }))),
  ];
  return { nodes, links };
}
