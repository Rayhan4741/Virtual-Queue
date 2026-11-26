'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, QrCode } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function QRScannerModal({
  open,
  onClose,
  onSubmitPayload,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitPayload: (payload: string) => void;
  loading: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    async function startCamera() {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API unavailable in this browser. Paste the entrance QR payload below.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
          }
        ).BarcodeDetector;
        if (Detector && videoRef.current) {
          const detector = new Detector({ formats: ['qr_code'] });
          timer = window.setInterval(async () => {
            if (!videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                onSubmitPayload(codes[0].rawValue);
              }
            } catch {
              // ignore
            }
          }, 600);
        }
      } catch {
        setCameraError('Camera permission denied or unavailable. Paste the entrance QR payload below.');
      }
    }

    startCamera();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onSubmitPayload]);

  return (
    <Modal open={open} onClose={onClose} title="Entrance QR Check-In">
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 aspect-video flex items-center justify-center">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-4 text-center text-xs text-slate-200">
              <Camera className="h-8 w-8 mb-2 text-slate-400" />
              <p>{cameraError}</p>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) onSubmitPayload(manualCode.trim());
          }}
          className="space-y-3"
        >
          <Input
            label="Or paste signed Entrance QR payload"
            placeholder="Paste QR token from organization entrance..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!manualCode.trim()}>
              <QrCode className="h-4 w-4" /> Verify & Check In
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
