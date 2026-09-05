import * as THREE from 'three';
import type { LogicPiece, SequencePiece } from '../LevelData';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import { OrderedSequence, combineInputs } from '../../signals/PuzzleLogic';
import { disposeObjects } from '../../runtime/disposeObjects';

/** Visible circuit status: separate input lamps, output diamond and sequence progress. */
export class LogicRelay implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly sequence: OrderedSequence | null;
  private a = false;
  private b = false;
  private readonly lamps: THREE.Mesh[] = [];
  private readonly output: THREE.Mesh;
  private disposed = false;
  constructor(readonly def: LogicPiece | SequencePiece, instance: LevelInstance) {
    this.id = instance.id; this.resetGroup = instance.resetGroup;
    this.sequence = def.kind === 'sequence' ? new OrderedSequence(def.timeout) : null;
    this.group.position.set(def.x,def.y,def.z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6,.08,1.5),new THREE.MeshBasicMaterial({color:0x251735}));
    base.position.y=.045;this.group.add(base);
    const count = this.sequence ? 3 : 2;
    for (let i=0;i<count;i++) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.06,12),new THREE.MeshBasicMaterial({color:0xffcc63}));
      lamp.position.set((i-(count-1)/2)*.7,.12,.3);this.lamps.push(lamp);this.group.add(lamp);
    }
    this.output = new THREE.Mesh(new THREE.OctahedronGeometry(.25),new THREE.MeshBasicMaterial({color:0xffcc63}));
    this.output.position.set(0,.3,-.35);this.group.add(this.output);
  }
  stateOutputs(): { active: boolean } { return { active: this.sequence?.active ?? combineInputs(this.def.kind==='logic'?this.def.operation:'and',this.a,this.b) }; }
  takePulses(): SignalPort[] { return this.sequence?.takeCompleted() ? ['completed'] : []; }
  receiveSignal(port: SignalPort, value: SignalValue): void {
    if (this.sequence) this.sequence.receive(port,value);
    else {
      if (port==='inputA' && typeof value==='boolean') this.a=value;
      if (port==='inputB' && typeof value==='boolean') this.b=value;
    }
  }
  fixedUpdate(_time: number, dt: number): void { this.sequence?.update(dt); }
  visualUpdate(_frame: VisualFrame): void {
    this.lamps.forEach((lamp,i)=>{
      const on = this.sequence ? this.sequence.progress>i : i===0?this.a:this.b;
      (lamp.material as THREE.MeshBasicMaterial).color.setHex(on?0x75ffe0:0x775048);
      lamp.scale.y=on?2.5:1;
    });
    const active = this.stateOutputs().active;
    (this.output.material as THREE.MeshBasicMaterial).color.setHex(active?0x75ffe0:0xffcc63);
    this.output.rotation.z=active?Math.PI/4:0;
    this.output.scale.setScalar(this.sequence && this.sequence.progress>0 && !active ? .4+.6*this.sequence.remaining/this.sequence.timeout : 1);
  }
  capture(): LogicalValue { return this.sequence ? this.sequence.capture() : { a:this.a,b:this.b }; }
  reset(state: LogicalValue): void {
    const s = state && typeof state==='object' && !Array.isArray(state)?state:{};
    this.a=s['a']===true;this.b=s['b']===true;this.sequence?.reset(s);
  }
  dispose(): void { if (this.disposed) return;this.disposed=true;disposeObjects(this.group); }
}
