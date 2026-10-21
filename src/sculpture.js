// src/sculpture.js — 施工中（見 CONTRACT.md）
import * as THREE from 'three';

export function build({ layout, materials, variant, rng }) {
  const group = new THREE.Group();
  group.name = 'sculpture';
  return group;
}
