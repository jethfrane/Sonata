// @ts-check
// The Play screen as one chunk: instruments, tuner, metronome and drums. Loaded when Play first opens.
import "../../css/music.css";
export { initPlay, renderPlay, setInstrument, currentInstrument } from "./play.js";
export { initMetronome, renderMetronome } from "./metronome.js";
export { stopTuner } from "./tuner.js";
