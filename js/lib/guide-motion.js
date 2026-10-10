/* Continuous joint animation. All clips enter and leave the same resting pose. */
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const bump = (time, start, duration) => time < start || time > start + duration ? 0 : Math.sin(Math.PI * (time - start) / duration) ** 2;
const rest = () => ({ head: 0, body: 0, leftUpper: .08, leftLower: -.12, rightUpper: -.08, rightLower: .12, skirt: 0, breath: 0, blink: 0, mouth: 0 });
export function createGuideMotion({ reduced = false, phase = 0 } = {}) {
  let elapsed = phase, requested = 'idle', speaking = 0, hinting = 0, waveTime = -1;
  let pose = rest(), clip = 'rest', progress = 0;
  return {
    setMode(value) { requested = value; },
    wave() { if (!reduced && waveTime < 0) waveTime = 0; },
    step(dt) {
      if (reduced) { pose = rest(); return pose; }
      dt = Math.max(0, Math.min(.064, dt));
      elapsed += dt;
      const blend = 1 - Math.exp(-dt * 7);
      speaking += ((requested === 'talking' ? 1 : 0) - speaking) * blend;
      hinting += ((requested === 'hint' ? 1 : 0) - hinting) * blend;
      const cycle = elapsed % 22;
      const look = bump(cycle, 5.5, 3.5), sleeve = bump(cycle, 9, 4);
      let greeting = bump(cycle, 13, 3);
      clip = look > .01 ? 'look' : sleeve > .01 ? 'sleeve' : greeting > .01 ? 'greet' : 'rest';
      progress = cycle / 22;
      if (waveTime >= 0) {
        waveTime += dt;
        greeting = Math.max(greeting, Math.sin(Math.PI * Math.min(1, waveTime / 2.8)) ** 2);
        if (waveTime >= 2.8) waveTime = -1;
        else { clip = 'greet'; progress = waveTime / 2.8; }
      }
      const talkBeat = Math.sin(elapsed * 2.7), whisper = hinting * (.7 + .3 * Math.sin(elapsed * 2));
      const calm = 1 - speaking;
      pose = {
        head: .017 * Math.sin(elapsed * .9) + .075 * look * calm + .035 * speaking * Math.sin(elapsed * 3.1),
        body: .008 * Math.sin(elapsed * .8),
        leftUpper: .08 + .10 * greeting + .10 * sleeve * calm,
        leftLower: -.12 + greeting * (2.65 + .16 * Math.sin(elapsed * 9)) - .65 * sleeve * calm,
        rightUpper: -.08 - speaking * (.13 + .03 * talkBeat) - .12 * whisper,
        rightLower: .12 - speaking * (.94 + .12 * talkBeat) - .5 * sleeve * calm - .75 * whisper,
        skirt: .008 * Math.sin(elapsed * 1.1 - .6),
        breath: 1.35 * Math.sin(elapsed * 1.55),
        blink: bump(elapsed % 4.9, 3.9, .23),
        mouth: speaking * (.20 + .78 * (.5 + .5 * Math.sin(elapsed * 11 + .6 * Math.sin(elapsed * 3)))) ,
      };
      if (speaking > .1) { clip = 'speak'; progress = (elapsed % 2.4) / 2.4; }
      return pose;
    },
    state: () => ({ pose: { ...pose }, clip, progress, elapsed, requested }),
  };
}
