import Joi from 'joi';

const baseSchema = {
  // orgUid - derived upon creation
  // warehouseProjectId - derived upon creation
  creditingPeriodStart: Joi.date().required(),
  creditingPeriodEnd: Joi.date()
    .timestamp()
    .min(Joi.ref('startDate'))
    .required(),
  unitCount: Joi.number().integer().required(),
  verificationDate: Joi.date().required(),
  verificationBody: Joi.string().required(),
  // Not sure where 'verificationDate' and 'verificationBody' fields are coming from. They are not supposed to be in the estimations table.
};

export const newEstimationSchema = Joi.object({ ...baseSchema });

export const existingEstimationSchema = Joi.object({
  id: Joi.string().required(),
  ...baseSchema,
});