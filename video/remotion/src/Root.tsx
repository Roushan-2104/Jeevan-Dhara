import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS } from './theme';
import { T } from './timeline';

export const Root: React.FC = () => (
  <Composition id="JeevanDhara" component={Film} durationInFrames={T.total * FPS} fps={FPS} width={1920} height={1080} />
);
