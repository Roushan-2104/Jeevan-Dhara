import { loadFont as anekLatin } from '@remotion/google-fonts/AnekLatin';
import { loadFont as anekDeva } from '@remotion/google-fonts/AnekDevanagari';
import { loadFont as anekKannada } from '@remotion/google-fonts/AnekKannada';
import { loadFont as anekTamil } from '@remotion/google-fonts/AnekTamil';
import { loadFont as anekTelugu } from '@remotion/google-fonts/AnekTelugu';
import { loadFont as anekMalayalam } from '@remotion/google-fonts/AnekMalayalam';
import { loadFont as anekBangla } from '@remotion/google-fonts/AnekBangla';
import { loadFont as anekGujarati } from '@remotion/google-fonts/AnekGujarati';
import { loadFont as anekGurmukhi } from '@remotion/google-fonts/AnekGurmukhi';
import { loadFont as schibsted } from '@remotion/google-fonts/SchibstedGrotesk';

const w = { weights: ['400', '600', '800'] as ('400' | '600' | '800')[] };
export const F = {
  latin: anekLatin('normal', { ...w, subsets: ['latin'] }).fontFamily,
  deva: anekDeva('normal', { ...w, subsets: ['devanagari', 'latin'] }).fontFamily,
  kannada: anekKannada('normal', { ...w, subsets: ['kannada'] }).fontFamily,
  tamil: anekTamil('normal', { ...w, subsets: ['tamil'] }).fontFamily,
  telugu: anekTelugu('normal', { ...w, subsets: ['telugu'] }).fontFamily,
  malayalam: anekMalayalam('normal', { ...w, subsets: ['malayalam'] }).fontFamily,
  bangla: anekBangla('normal', { ...w, subsets: ['bengali'] }).fontFamily,
  gujarati: anekGujarati('normal', { ...w, subsets: ['gujarati'] }).fontFamily,
  gurmukhi: anekGurmukhi('normal', { ...w, subsets: ['gurmukhi'] }).fontFamily,
  ui: schibsted('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily,
};

// Stack Latin first so mixed strings (e.g. "O−, 2 यूनिट") pick the right face per script.
export const stack = (script: keyof typeof F) => `${F.latin}, ${F[script]}, sans-serif`;

export const C = {
  paper: '#F2F2EF',
  ink: '#121314',
  red: '#D32F2F',
  redDeep: '#B71C1C',
  mute: '#6E716C',
  hair: 'rgba(18,19,20,0.09)',
  hairStrong: 'rgba(18,19,20,0.22)',
  card: '#FFFFFF',
  stale: '#8A5300',
};

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);
