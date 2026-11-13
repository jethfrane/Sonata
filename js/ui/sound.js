// @ts-check
// The metronome and drum looper every sound screen shares. Importing this file loads the audio
// engine, so only screens that make sound import it (Play, Stage); the rest of the app stays light.
import { Metronome, DrumLooper } from "../audio.js";

export const metronome = new Metronome();
export const drumLooper = new DrumLooper();
