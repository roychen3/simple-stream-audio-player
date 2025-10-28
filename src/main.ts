import './style.css';
import mockAudioChunk from './example-linear16-base64-chunk.json';

import { StreamAudioPlayer } from './stream-audio-player';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <div id="status">-</div>
    <br />
    <button id="load-and-play" type="button">Load & Play</button>
    <button id="pause" type="button" disabled>Pause</button>
    <button id="reset" type="button" disabled>Reset</button>
  </div>
`;
const statusDiv = document.querySelector<HTMLDivElement>('#status')!;
const loadAndPlayButton =
  document.querySelector<HTMLButtonElement>('#load-and-play')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!;

let isPlaying = false;
const player = new StreamAudioPlayer();

const handlePlayEnded = () => {
  console.log('[PlayEnded]');
  if (resetButton.disabled) {
    console.log('[PlayEnded] skipping state update due to the data is not loaded yet.');
    return;
  }
  isPlaying = false;
  loadAndPlayButton.disabled = false;
  pauseButton.disabled = true;
  resetButton.disabled = false;
  statusDiv.textContent = 'Playback ended';
};
player.addEventListener('ended', handlePlayEnded);

loadAndPlayButton.addEventListener('click', async () => {
  isPlaying = true;
  loadAndPlayButton.disabled = true;
  pauseButton.disabled = false;
  resetButton.disabled = true;
  statusDiv.textContent = 'Loading and Playing...';

  for (const chunk of mockAudioChunk) {
    // Simulate real-time streaming by waiting between chunks
    await new Promise((resolve) => setTimeout(resolve, 100));
    await player.addChunk(chunk, 16000);
    if (isPlaying && player.state !== 'playing') {
      player.play();
    }
  }
  resetButton.disabled = false;
  loadAndPlayButton.textContent = 'Reload & Play';
});

pauseButton.addEventListener('click', () => {
  if (isPlaying) {
    isPlaying = false;
    player.pause();
    pauseButton.textContent = 'Resume';
    statusDiv.textContent = 'Playback stopped';
    return;
  }

  isPlaying = true;
  player.play();
  pauseButton.textContent = 'Pause';
  statusDiv.textContent = 'Resumed playing...';
});

resetButton.addEventListener('click', async () => {
  isPlaying = false;
  loadAndPlayButton.disabled = true;
  pauseButton.disabled = true;
  resetButton.disabled = true;

  await player.reset();
  player.addEventListener('ended', handlePlayEnded);

  loadAndPlayButton.disabled = false;
  statusDiv.textContent = 'Reset completed';
});
