declare module 'pdfjs-dist/build/pdf' {
  export const getDocument: any;
  export const GlobalWorkerOptions: {
    workerSrc: any;
  };
}

declare module 'pdfjs-dist/build/pdf.worker.min.js?url' {
  const src: string;
  export default src;
}

declare module 'heic2any' {
  interface Heic2anyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }

  function heic2any(options: Heic2anyOptions): Promise<Blob | Blob[]>;

  export default heic2any;
}