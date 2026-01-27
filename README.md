# WebAudio Signal Generator

A simple yet powerful web-based signal generator built with WebAudio API.

## Features

- **Multiple Waveforms**: Sine, Square, Sawtooth, Triangle.
- **Noise Generation**: White Noise, Pink Noise, and Brownian Noise implemented via `AudioWorklet`.
- **Real-time Visualization**: FFT (Fast Fourier Transform) visualizer to see the frequency spectrum.
- **Multiple Oscillators**: Add and mix multiple signal sources.
- **State Persistence**: Current configuration is automatically saved to the URL, making it easy to share or bookmark specific setups.
- **Presets**: Quick access to common setups (White, Pink, Brown noise, and a CM7 chord).

## Implementation Details

- **Noise Node**: Custom `AudioWorkletNode` implementation in `noise-node.js` provides high-quality noise generators (Box-Muller transform for white noise, Voss-McCartney algorithm for pink noise).
- **URL Serialization**: Configurations are serialized into URL parameters (`osc=type-freq-gain`) using `URLSearchParams` and `history.replaceState`.

## License

MIT
