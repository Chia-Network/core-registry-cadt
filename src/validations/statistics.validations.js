import Joi from 'joi';

export const projectsStatisticsGetQuerySchema = Joi.object()
  .keys({
    dateRangeStart: Joi.date(),
    dateRangeEnd: Joi.date(),
    ytd: Joi.boolean(),
  })
  .with('dateRangeStart', 'dateRangeEnd')
  .with('dateRangeEnd', 'dateRangeStart')
  .oxor('ytd', 'dateRangeStart')
  .oxor('ytd', 'dateRangeEnd');

export const tonsCo2StatisticsGetQuerySchema = Joi.object()
  .keys({
    set: Joi.string().valid('issuedAuthorizedNdc', 'retiredBuffer').required(),
    dateRangeStart: Joi.date(),
    dateRangeEnd: Joi.date(),
    ytd: Joi.boolean(),
  })
  .with('dateRangeStart', 'dateRangeEnd')
  .with('dateRangeEnd', 'dateRangeStart')
  .oxor('ytd', 'dateRangeStart')
  .oxor('ytd', 'dateRangeEnd');