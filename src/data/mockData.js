'use strict';

/**
 * 模拟辅助数据：本地气象数据 + 各地区蜜源花期日历
 * 生产环境应替换为气象局 API 和实际蜜源调查数据
 */

/* ----------------------------- 蜜源花期日历 ----------------------------- */

const nectarSources = {
  '阿坝州': [
    { name: '油菜', startMonth: 3, endMonth: 4, honeyPotential: 0.8 },
    { name: '山花', startMonth: 5, endMonth: 7, honeyPotential: 1.2 },
    { name: '黄连', startMonth: 6, endMonth: 8, honeyPotential: 0.6 },
    { name: '五倍子', startMonth: 8, endMonth: 9, honeyPotential: 0.9 },
  ],
  '雅安市': [
    { name: '油菜', startMonth: 2, endMonth: 4, honeyPotential: 1.0 },
    { name: '柑橘', startMonth: 4, endMonth: 5, honeyPotential: 0.7 },
    { name: '乌桕', startMonth: 6, endMonth: 7, honeyPotential: 1.1 },
    { name: '茶花', startMonth: 10, endMonth: 11, honeyPotential: 0.5 },
  ],
  '凉山州': [
    { name: '油菜', startMonth: 1, endMonth: 3, honeyPotential: 0.7 },
    { name: '石榴', startMonth: 5, endMonth: 6, honeyPotential: 0.6 },
    { name: '荞麦', startMonth: 8, endMonth: 9, honeyPotential: 0.8 },
    { name: '野坝子', startMonth: 10, endMonth: 12, honeyPotential: 1.0 },
  ],
};

function getActiveNectarSources(district, date) {
  const sources = nectarSources[district] || [];
  const d = new Date(date);
  const month = d.getMonth() + 1;
  return sources.filter(s => month >= s.startMonth && month <= s.endMonth);
}

function getNectarFlowIntensity(district, date) {
  const active = getActiveNectarSources(district, date);
  if (active.length === 0) return 0;
  return active.reduce((sum, s) => sum + s.honeyPotential, 0) / active.length;
}

function getNextBloomPeriod(district, fromDate) {
  const sources = nectarSources[district] || [];
  const d = new Date(fromDate);
  const currentMonth = d.getMonth() + 1;
  const currentDay = d.getDate();

  for (const source of sources) {
    if (source.startMonth > currentMonth) {
      const start = new Date(d.getFullYear(), source.startMonth - 1, 1);
      const end = new Date(d.getFullYear(), source.endMonth - 1, 28);
      return { source, startDate: start, endDate: end };
    }
    if (source.startMonth === currentMonth && 1 > currentDay) {
      const start = new Date(d.getFullYear(), source.startMonth - 1, 1);
      const end = new Date(d.getFullYear(), source.endMonth - 1, 28);
      return { source, startDate: start, endDate: end };
    }
  }

  const first = sources[0];
  if (first) {
    const start = new Date(d.getFullYear() + 1, first.startMonth - 1, 1);
    const end = new Date(d.getFullYear() + 1, first.endMonth - 1, 28);
    return { source: first, startDate: start, endDate: end };
  }
  return null;
}

/* ----------------------------- 气象模拟数据 ----------------------------- */

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateWeatherData(district, startDate, days) {
  const rand = seededRandom(district.length * 1000 + startDate.getMonth());
  const data = [];
  const baseTemps = {
    '阿坝州': { min: 5, max: 18 },
    '雅安市': { min: 12, max: 25 },
    '凉山州': { min: 10, max: 22 },
  };
  const base = baseTemps[district] || { min: 10, max: 22 };

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const month = date.getMonth() + 1;

    const seasonalAdj = Math.sin((month - 1) * Math.PI / 6) * 8;
    const tempMin = base.min + seasonalAdj + (rand() - 0.5) * 4;
    const tempMax = base.max + seasonalAdj + (rand() - 0.5) * 6;

    const rainChance = month >= 6 && month <= 9 ? 0.4 : 0.2;
    const rainfall = rand() < rainChance ? rand() * 30 : 0;

    const humidity = 60 + rand() * 30 - (rainfall > 0 ? 0 : 10);
    const windSpeed = 5 + rand() * 15;

    const foragingTemp = tempMax >= 15 && tempMax <= 30;
    const goodForaging = foragingTemp && rainfall < 5 && windSpeed < 20;

    data.push({
      date: date.toISOString().split('T')[0],
      tempMin: Math.round(tempMin * 10) / 10,
      tempMax: Math.round(tempMax * 10) / 10,
      rainfall: Math.round(rainfall * 10) / 10,
      humidity: Math.round(humidity),
      windSpeed: Math.round(windSpeed),
      foragingSuitable: goodForaging ? 1 : (foragingTemp ? 0.5 : 0.2),
    });
  }
  return data;
}

function getWeatherForecast(district, fromDate, daysAhead = 30) {
  const start = typeof fromDate === 'string' ? new Date(fromDate) : fromDate;
  return generateWeatherData(district, start, daysAhead);
}

function getHistoricalWeather(district, toDate, daysBack = 90) {
  const start = new Date(typeof toDate === 'string' ? toDate : toDate);
  start.setDate(start.getDate() - daysBack);
  return generateWeatherData(district, start, daysBack);
}

function calculateWeatherSuitability(weatherData) {
  if (!weatherData || weatherData.length === 0) return 0.5;
  const total = weatherData.reduce((sum, w) => sum + w.foragingSuitable, 0);
  return total / weatherData.length;
}

/* ----------------------------- 区域基础蜜产系数 ----------------------------- */

const districtBaseYield = {
  '阿坝州': 25,
  '雅安市': 30,
  '凉山州': 22,
};

function getDistrictBaseYield(district) {
  return districtBaseYield[district] || 20;
}

module.exports = {
  nectarSources,
  getActiveNectarSources,
  getNectarFlowIntensity,
  getNextBloomPeriod,
  getWeatherForecast,
  getHistoricalWeather,
  calculateWeatherSuitability,
  getDistrictBaseYield,
};
