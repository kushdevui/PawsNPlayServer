import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { AppError } from '../../utils/AppError.js';
import { created } from '../../utils/respond.js';
import { ALLOWED_MIME, MAX_FILE_BYTES } from '../dogs/dogs.model.js';
import { storeFile } from './storage.js';

const TYPE_MESSAGE = 'Documents must be images or PDFs.';
const tooLarge = (name: string) => `${name} is larger than 10 MB.`;

/** image/* or application/pdf; SVG is refused because it can carry scripts when opened in a browser. */
export const isAllowedMime = (mime: string) => ALLOWED_MIME.test(mime) && !/^image\/svg/i.test(mime);

type UploadRequest = Request & { uploadName?: string };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 10 },
  fileFilter: (req, file, callback) => {
    (req as UploadRequest).uploadName = file.originalname;
    if (!isAllowedMime(file.mimetype)) {
      callback(AppError.validation(TYPE_MESSAGE));
      return;
    }
    callback(null, true);
  },
});

/** multer.single('file') with its errors turned into the 422 envelope (spec §7.11). */
const receiveFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      const name = (req as UploadRequest).uploadName ?? 'This file';
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(AppError.validation(tooLarge(name)));
        return;
      }
      next(AppError.validation('Send one file in the "file" field.'));
      return;
    }
    next(err);
  });
};

const handleUpload: RequestHandler = async (req, res) => {
  const file = req.file;
  if (!file) throw AppError.validation('Choose a file to upload.');
  if (file.size > MAX_FILE_BYTES) throw AppError.validation(tooLarge(file.originalname));

  const origin = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  const stored = await storeFile({
    buffer: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    origin,
  });
  created(res, { url: stored.url, name: file.originalname, mimeType: file.mimetype, size: file.size });
};

export const uploadsRouter = Router();

// roles: admin (spec §4)
uploadsRouter.route('/').post(requireAuth, requireRole('admin'), receiveFile, handleUpload).all(methodNotAllowed);
