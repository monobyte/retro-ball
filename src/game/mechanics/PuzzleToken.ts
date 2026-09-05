import * as THREE from 'three';
import type { PuzzleToken } from '../LevelData';

export const TOKEN_COLORS: Record<PuzzleToken, number> = { triangle:0xffcc63, circle:0x75ffe0, square:0xca94ff };

/** The same physical glyph appears on a resonator and its matching receivers. */
export function tokenMarker(token: PuzzleToken, radius: number): THREE.Group {
  const group=new THREE.Group();
  const backing=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.25,radius*1.25,.025,24),new THREE.MeshBasicMaterial({color:0x111322}));
  group.add(backing);
  const geometry=new THREE.TorusGeometry(radius,.035,5,token==='circle'?32:token==='triangle'?3:4);
  if(token==='square')geometry.rotateZ(Math.PI/4);
  const glyph=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:TOKEN_COLORS[token]}));
  glyph.rotation.x=-Math.PI/2;glyph.position.y=.035;group.add(glyph);
  return group;
}
