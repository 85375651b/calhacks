// A bounded queue shared by address checks in this process.
let active = 0;
const waiting = [];
export async function addressSlot(fn) {
  if (active >= 3) {
    if (waiting.length >= 30)
      throw Object.assign(Error("Address lookup is busy. Try again shortly."), {
        status: 503,
      });
    await new Promise((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
