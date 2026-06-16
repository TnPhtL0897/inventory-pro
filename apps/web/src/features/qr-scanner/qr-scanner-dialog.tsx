"use client";

/**
 * QR/Barcode Scanner Dialog
 * Dùng @zxing/browser để scan QR code từ camera.
 * Hỗ trợ scan lô HC-SP để mở open-vial nhanh / FEFO pick.
 *
 * Lưu ý: cần HTTPS hoặc localhost để camera hoạt động.
 * Mobile-first: nút to, contrast cao, dễ dùng khi đeo găng tay.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, AlertCircle, Loader2, CheckCircle2, X } from "lucide-react";

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (decodedText: string) => void;
  title?: string;
  description?: string;
}

export function QrScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = "📷 Quét QR / Barcode",
  description = "Hướng camera vào QR trên nhãn lô HC-SP",
}: QrScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const readerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }
    startScanner();

    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startScanner = async () => {
    setError(null);
    setLastScan(null);
    try {
      // Lazy load zxing (chỉ khi user mở dialog)
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (devices.length === 0) {
        setError("Không tìm thấy camera trên thiết bị này");
        return;
      }

      // Ưu tiên camera sau (mobile)
      const backCamera =
        devices.find((d) => /back|environment|rear/i.test(d.label)) || devices[0];

      setScanning(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: backCamera.deviceId, facingMode: "environment" },
      });
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute("playsinline", "true"); // iOS
        await videoRef.current.play();
      }

      // Bắt đầu decode
      await reader.decodeFromVideoElement(videoRef.current!, (result: any) => {
        if (result) {
          const text = result.getText();
          setLastScan(text);
          // Vibrate (mobile)
          if (navigator.vibrate) navigator.vibrate(200);
          // Gọi callback + đóng dialog
          onScan(text);
          stopScanner();
          onOpenChange(false);
        }
      });
    } catch (err: any) {
      console.error("[QR Scanner] Error:", err);
      if (err.name === "NotAllowedError") {
        setError(
          "Bạn cần cấp quyền truy cập camera để quét QR. Vào Settings → Camera → Allow."
        );
      } else if (err.name === "NotFoundError") {
        setError("Không tìm thấy camera trên thiết bị này");
      } else {
        setError(`Lỗi camera: ${err.message ?? "Unknown"}`);
      }
      setScanning(false);
    }
  };

  const stopScanner = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (readerRef.current) {
      try {
        readerRef.current.reset?.();
      } catch {
        // ignore
      }
    }
    setScanning(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) stopScanner();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Video preview */}
        <div className="relative bg-black rounded-md overflow-hidden aspect-square">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {!scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Không thể mở camera</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lastScan && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle>Đã quét thành công</AlertTitle>
            <AlertDescription>
              <code className="text-xs">{lastScan}</code>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              stopScanner();
              startScanner();
            }}
            disabled={!scanning}
            className="flex-1"
          >
            🔄 Restart
          </Button>
          <Button
            variant="default"
            onClick={() => {
              stopScanner();
              onOpenChange(false);
            }}
            className="flex-1"
          >
            <X className="mr-2 h-4 w-4" />
            Đóng
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          💡 Tip: Dùng camera sau (back) để quét QR dán trên lọ thuốc
        </p>
      </DialogContent>
    </Dialog>
  );
}
