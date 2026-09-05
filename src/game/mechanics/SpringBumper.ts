import type { SignalPort, SignalValue } from '../../signals/SignalTypes';
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { BumperPiece } from '../LevelData';
import type { LevelInstance } from '../../content/LevelDocument';
import type { RuntimeComponent, LogicalValue, VisualFrame } from '../../runtime/Component';
import type { Physics, BallHandles } from '../../physics/Physics';
import { disposeObjects } from '../../runtime/disposeObjects';

type Phase = 'idle' | 'charging' | 'cooldown';
const CHARGE = .12;
/** Contact compresses the spring before one bounded outward kick. */
export class SpringBumper implements RuntimeComponent {
  readonly id: string;
  readonly resetGroup: string;
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  private phase: Phase = 'idle';
  private remaining = 0;
  private readonly cap: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly light = new THREE.MeshBasicMaterial({color:0xffce63});
  private disposed = false;

  constructor(readonly def: BumperPiece, instance: LevelInstance, private readonly physics: Physics) {
    this.id=instance.id;this.resetGroup=instance.resetGroup;
    this.body=physics.createFixedCylinder(new THREE.Vector3(def.x,def.y+.6,def.z),def.radius,1.2);
    this.group.position.set(def.x,def.y,def.z);
    const dark=new THREE.MeshBasicMaterial({color:0x312345});
    const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(def.radius,def.radius,1.2,32),dark);cylinder.position.y=.6;this.group.add(cylinder);
    this.cap=new THREE.Mesh(new THREE.CylinderGeometry(def.radius*1.04,def.radius*1.04,.12,32),this.light);this.cap.position.y=1.22;this.group.add(this.cap);
    this.ring=new THREE.Mesh(new THREE.TorusGeometry(def.radius+.12,.055,8,40),this.light);this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.1;this.group.add(this.ring);
    const spring=[];
    for(let i=0;i<=100;i++){const t=i/100;spring.push(new THREE.Vector3(Math.cos(t*Math.PI*8)*def.radius*1.01,.2+t*.8,Math.sin(t*Math.PI*8)*def.radius*1.01))}
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(spring),new THREE.LineBasicMaterial({color:0xffe1a0})));
  }
  fixedUpdate(_time: number,dt:number):void {
    this.remaining=Math.max(0,this.remaining-dt);
    if(this.phase==='cooldown'&&this.remaining===0)this.phase='idle';
  }
  contact(ball:BallHandles):boolean {
    const p=ball.body.translation(),d=this.def;
    if(this.phase==='idle'&&p.y<d.y+1.2&&this.physics.touching(ball.collider,this.body.collider(0))){this.phase='charging';this.remaining=CHARGE}
    if(this.phase!=='charging'||this.remaining>1e-9)return false;
    this.phase='cooldown';this.remaining=d.cooldown;
    const dx=p.x-d.x,dz=p.z-d.z,distance=Math.hypot(dx,dz);
    if(distance>d.radius+.8||p.y<d.y-.5||p.y>d.y+1.5)return false;
    const normal=new THREE.Vector3(dx,0,dz).normalize();if(!normal.lengthSq())normal.set(1,0,0);
    const v=ball.body.linvel(),along=v.x*normal.x+v.z*normal.z;
    const change=THREE.MathUtils.clamp(d.kickSpeed-along,0,20);
    ball.body.applyImpulse(normal.multiplyScalar(change*ball.body.mass()),true);
    return change>0;
  }
  visualUpdate(_frame:VisualFrame):void {
    const compression=this.phase==='charging'?1-this.remaining/CHARGE:0;
    this.cap.position.y=1.22-compression*.18;
    this.ring.scale.setScalar(this.phase==='cooldown'?1+.18*this.remaining/this.def.cooldown:1);
    this.light.color.setHex(this.phase==='charging'?0xffffff:this.phase==='cooldown'?0xef568c:0xffce63);
  }
  receiveSignal(port: SignalPort, _value: SignalValue): void { if (port === 'reset') this.reset(null); }
  capture():LogicalValue{return {phase:this.phase,remaining:this.remaining}}
  reset(state:LogicalValue):void {
    const s=state&&typeof state==='object'&&!Array.isArray(state)?state:{};
    this.phase=['idle','charging','cooldown'].includes(String(s['phase']))?s['phase'] as Phase:'idle';
    this.remaining=typeof s['remaining']==='number'&&Number.isFinite(s['remaining'])?THREE.MathUtils.clamp(s['remaining'],0,this.phase==='charging'?CHARGE:this.def.cooldown):0;
  }
  dispose():void{if(this.disposed)return;this.disposed=true;disposeObjects(this.group);this.physics.removeBody(this.body)}
}
