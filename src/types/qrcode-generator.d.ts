declare module 'qrcode-generator' {
  export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  export interface QRCode {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
    createSvgTag(options?: { cellSize?: number; margin?: number }): string;
    createDataURL(cellSize?: number, margin?: number): string;
  }

  function qrcode(
    typeNumber: number,
    errorCorrectionLevel: ErrorCorrectionLevel,
  ): QRCode;

  export = qrcode;
}
