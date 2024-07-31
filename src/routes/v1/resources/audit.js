'use strict';

import express from 'express';
import joiExpress from 'express-joi-validation';

import { AuditController } from '../../../controllers/index.js';
import { auditGetSchema } from '../../../validations/index.js';

const validator = joiExpress.createValidator({ passError: true });
const AuditRouter = express.Router();

AuditRouter.get('/', validator.query(auditGetSchema), (req, res) => {
  return AuditController.findAll(req, res);
});

AuditRouter.get('/findConflicts', (req, res) => {
  return AuditController.findConflicts(req, res);
});

export { AuditRouter };
