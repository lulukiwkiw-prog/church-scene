import * as THREE from 'three';
import { Mesher, facing } from './geo.js';
import { figure, spec } from './figure.js';
export function build({ layout, materials, variant, rng }) {
  const g = new THREE.Group();
  const M = new Mesher();
  const kinds = ['apostle','peter','king','virgin','christ','bishop','angel','prophet','elder','adam','eve','devil','denis','synagoga'];
  kinds.forEach((k, i) => {
    const S = spec(k, rng('sculpture/test/' + i), { lod: 2 });
    M.push(facing([-2, 0, (i - kinds.length / 2) * 1.1], -1, 0, 2.6));
    figure(M, S);
    M.pop();
  });
  g.add(new THREE.Mesh(M.toGeometry(), variant('stoneCarved', { vertexColors: true })));
  return g;
}
