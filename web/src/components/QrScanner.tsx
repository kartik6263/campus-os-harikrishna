import { useEffect, useRef, useState } from 'react';

interface Detector { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Whether this browser can read QR codes from the camera (Chrome, Edge, Android). */
export const canScanQr = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Reads a QR code from the camera and hands back its text once. The camera is
 * released as soon as a code is read or the component goes away.
 */
export default function QrScanner({ onRead }: { onRead: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!canScanQr()) { setProblem('This browser cannot read QR codes from the camera. Type the code shown under the QR instead.'); return; }
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ['qr_code'] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (done.current || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes[0]?.rawValue) { done.current = true; onRead(codes[0].rawValue); return; }
          } catch { /* a frame that could not be read; try the next */ }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setProblem('Camera permission was refused or no camera is available. Type the code instead.');
      }
    })();

    return () => {
      done.current = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [onRead]);

  if (problem) return <p className="text-[13px] text-[#8A6D1F] bg-[#FEF9EC] border border-[#FDE68A] rounded-[4px] px-3 py-2">{problem}</p>;
  return (
    <div className="relative bg-black rounded-[4px] overflow-hidden aspect-square max-w-[320px] mx-auto">
      <video ref={video} muted playsInline className="w-full h-full object-cover" />
      <div className="absolute inset-8 border-2 border-white/80 rounded-[8px] pointer-events-none" />
    </div>
  );
}
