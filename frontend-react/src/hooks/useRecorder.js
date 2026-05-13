import { useState, useRef, useCallback, useEffect } from 'react';

const FMT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function useRecorder() {
  const [recState, setRecState] = useState('idle'); // idle | recording | stopped
  const [blob, setBlob]         = useState(null);
  const [elapsed, setElapsed]   = useState(0);
  const [bars, setBars]         = useState(() => new Array(32).fill(4));
  const [micError, setMicError] = useState(null);

  const r = useRef({});

  const cleanup = useCallback(() => {
    cancelAnimationFrame(r.current.raf);
    clearInterval(r.current.timer);
    r.current.stream?.getTracks().forEach(t => t.stop());
    r.current.audioCtx?.close().catch(() => {});
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setMicError(null);
    setBlob(null);
    setElapsed(0);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError('Microphone access denied. Please allow mic permission and try again.');
      return;
    }
    r.current.stream = stream;

    const audioCtx = new AudioContext();
    r.current.audioCtx = audioCtx;
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser);

    const draw = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      setBars(Array.from(data).map(v => Math.max(4, Math.round((v / 255) * 34))));
      r.current.raf = requestAnimationFrame(draw);
    };
    draw();

    const chunks = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      setBlob(new Blob(chunks, { type: 'audio/webm' }));
      setRecState('stopped');
    };
    rec.start();
    r.current.recorder = rec;

    const t0 = Date.now();
    r.current.timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 1000);

    setRecState('recording');
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(r.current.raf);
    clearInterval(r.current.timer);
    r.current.stream?.getTracks().forEach(t => t.stop());
    r.current.audioCtx?.close().catch(() => {});
    setBars(new Array(32).fill(4));
    r.current.recorder?.stop();
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setRecState('idle');
    setBlob(null);
    setElapsed(0);
    setBars(new Array(32).fill(4));
    setMicError(null);
  }, [cleanup]);

  return { recState, blob, elapsed, bars, micError, fmt: FMT, start, stop, reset };
}
