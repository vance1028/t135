'use strict';

const express = require('express');
const prediction = require('../prediction');
const { authRequired } = require('../auth');
const { sendData, sendError, parseId } = require('../utils/http');

const router = express.Router();

router.use(authRequired);

router.get('/yield', (req, res) => {
  try {
    const { apiaryId, forecastDays, baseDate } = req.query;
    const options = {};
    if (forecastDays) options.forecastDays = parseInt(forecastDays, 10);
    if (baseDate) options.baseDate = new Date(baseDate);

    let result;
    if (apiaryId !== undefined) {
      result = prediction.getApiaryReport(parseInt(apiaryId, 10), options);
      if (!result) return sendError(res, 404, '蜂场不存在');
    } else {
      const predictions = prediction.predictAllHives(options);
      result = {
        count: predictions.length,
        predictions,
      };
    }

    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/yield/:hiveId', (req, res) => {
  try {
    const id = parseId(req.params.hiveId);
    const { forecastDays, baseDate } = req.query;
    const options = {};
    if (forecastDays) options.forecastDays = parseInt(forecastDays, 10);
    if (baseDate) options.baseDate = new Date(baseDate);

    const result = prediction.predictHiveYield(id, options);
    if (!result) return sendError(res, 404, '蜂群不存在');

    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/evaluation', (req, res) => {
  try {
    const { forecastDays, baseDate } = req.query;
    const options = {};
    if (forecastDays) options.forecastDays = parseInt(forecastDays, 10);
    if (baseDate) options.baseDate = new Date(baseDate);

    const result = prediction.evaluateAllHives(options);
    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/evaluation/:hiveId', (req, res) => {
  try {
    const id = parseId(req.params.hiveId);
    const { forecastDays, baseDate } = req.query;
    const options = {};
    if (forecastDays) options.forecastDays = parseInt(forecastDays, 10);
    if (baseDate) options.baseDate = new Date(baseDate);

    const result = prediction.evaluateSingleHive(id, options);
    if (!result) return sendError(res, 404, '蜂群不存在');

    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/harvest-timing', (req, res) => {
  try {
    const result = prediction.suggestAllHarvestTiming();
    return sendData(res, 200, {
      count: result.length,
      suggestions: result,
    });
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/harvest-timing/:hiveId', (req, res) => {
  try {
    const id = parseId(req.params.hiveId);
    const result = prediction.suggestHarvestTiming(id);
    if (!result) return sendError(res, 404, '蜂群不存在');

    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/summary', (req, res) => {
  try {
    const { forecastDays, baseDate } = req.query;
    const options = {};
    if (forecastDays) options.forecastDays = parseInt(forecastDays, 10);
    if (baseDate) options.baseDate = new Date(baseDate);

    const result = prediction.getFullReport(options);
    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

router.get('/summary/apiary/:apiaryId', (req, res) => {
  try {
    const id = parseId(req.params.apiaryId);
    const { forecastDays, baseDate } = req.query;
    const options = {};
    if (forecastDays) options.forecastDays = parseInt(forecastDays, 10);
    if (baseDate) options.baseDate = new Date(baseDate);

    const result = prediction.getApiaryReport(id, options);
    if (!result) return sendError(res, 404, '蜂场不存在');

    return sendData(res, 200, result);
  } catch (e) {
    return sendError(res, e.statusCode || 500, e.message);
  }
});

module.exports = router;
