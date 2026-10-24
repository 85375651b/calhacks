export function pushHistory(history,next){return {past:[...history.past,history.present].slice(-50),present:next,future:[]};}
export function undo(history){if(!history.past.length)return history;return {past:history.past.slice(0,-1),present:history.past.at(-1),future:[history.present,...history.future]};}
export function redo(history){if(!history.future.length)return history;return {past:[...history.past,history.present],present:history.future[0],future:history.future.slice(1)};}
