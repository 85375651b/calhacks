import {moduleHandler,coords,coordinate} from './shared.js';import {commuteProvider,nextTuesday} from '../providers/commute.js';
export const commute=moduleHandler('commute',q=>{const p={...coords(q),workLat:coordinate(q.workLat,-90,90),workLng:coordinate(q.workLng,-180,180)};return {...p,date:nextTuesday(p.lat,p.lng).date}},commuteProvider);
