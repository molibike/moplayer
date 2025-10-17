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