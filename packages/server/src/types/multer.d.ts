// Multer type declarations (since @types/multer fails to install in monorepo)
declare module 'multer' {
  import { RequestHandler } from 'express';

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }

  interface Options {
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    fileFilter?: (req: Express.Request, file: File, cb: (error: Error | null, acceptFile: boolean) => void) => void;
  }

  interface StorageEngine {
    _handleFile(req: Express.Request, file: File, cb: (error: Error | null, info?: Partial<File>) => void): void;
    _removeFile(req: Express.Request, file: File, cb: (error: Error) => void): void;
  }

  interface Multer {
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  function multer(options?: Options): Multer;

  namespace multer {
    function memoryStorage(): StorageEngine;
    function diskStorage(options: { destination?: string | ((req: Express.Request, file: File, cb: (error: Error | null, destination: string) => void) => void); filename?: (req: Express.Request, file: File, cb: (error: Error | null, filename: string) => void) => void }): StorageEngine;
  }

  export = multer;
}

declare global {
  namespace Express {
    interface Request {
      file?: import('multer').File;
      files?: import('multer').File[] | { [fieldname: string]: import('multer').File[] };
    }
  }
}
