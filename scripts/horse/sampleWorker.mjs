// Fil de calcul : échantillonne des blocs du champ de distance du cheval.
import { parentPort, workerData } from 'node:worker_threads';
import { buildHorse } from './anatomy.mjs';
import { sampleBlockArray } from './mesher.mjs';

const scene = buildHorse();
const { geom, keys } = workerData;
const arrays = keys.map((k) => sampleBlockArray(scene, geom, k));
parentPort.postMessage({ keys, arrays }, arrays.map((a) => a.buffer));
