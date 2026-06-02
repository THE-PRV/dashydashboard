import { get } from './client.js';

export const getCurrentCycle = () => get('/api/cycles/current');
export const getAllCycles = () => get('/api/cycles');
