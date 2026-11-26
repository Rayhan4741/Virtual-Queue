import mongoose from 'mongoose';
import { Token } from '../models/Token.js';
import { Counter } from '../models/Counter.js';
import { ServiceLog } from '../models/ServiceLog.js';
import { getTodayDateString } from './tokenEngine.js';

export async function getAdminDashboardSummary(organizationId: string) {
  const orgObjId = new mongoose.Types.ObjectId(organizationId);
  const today = getTodayDateString();

  const [statusCounts, activeCounters, todayLogs] = await Promise.all([
    Token.aggregate([
      { $match: { organizationId: orgObjId, queueDate: today } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Counter.countDocuments({ organizationId: orgObjId, status: 'ACTIVE' }),
    ServiceLog.aggregate([
      {
        $match: {
          organizationId: orgObjId,
          completedAt: { $gte: new Date(`${today}T00:00:00.000Z`) },
        },
      },
      {
        $group: {
          _id: null,
          avgWaitSec: { $avg: '$waitTimeSec' },
          avgDurationSec: { $avg: '$durationSec' },
        },
      },
    ]),
  ]);

  const counts: Record<string, number> = {};
  let totalToday = 0;
  for (const row of statusCounts) {
    counts[row._id] = row.count;
    totalToday += row.count;
  }

  return {
    totalTokensToday: totalToday,
    waiting: (counts.WAITING || 0) + (counts.CHECKED_IN || 0),
    serving: (counts.CALLED || 0) + (counts.SERVING || 0),
    completed: counts.COMPLETED || 0,
    cancelled: counts.CANCELLED || 0,
    noShow: counts.NO_SHOW || 0,
    skipped: counts.SKIPPED || 0,
    activeCounters,
    avgWaitMinutes: Math.round((todayLogs[0]?.avgWaitSec || 0) / 60),
    avgServiceMinutes: Math.round((todayLogs[0]?.avgDurationSec || 0) / 60),
  };
}

export async function getAdminAnalytics(organizationId: string, days = 14) {
  const orgObjId = new mongoose.Types.ObjectId(organizationId);
  const since = new Date(Date.now() - days * 86400000);

  const [tokensPerDay, statusBreakdown, servicePopularity, hourlyStats, counterPerf] = await Promise.all([
    Token.aggregate([
      { $match: { organizationId: orgObjId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$queueDate',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
          noShow: { $sum: { $cond: [{ $eq: ['$status', 'NO_SHOW'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Token.aggregate([
      { $match: { organizationId: orgObjId, createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Token.aggregate([
      { $match: { organizationId: orgObjId, createdAt: { $gte: since } } },
      { $group: { _id: '$serviceId', count: { $sum: 1 } } },
      { $lookup: { from: 'services', localField: '_id', foreignField: '_id', as: 'service' } },
      { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
      { $project: { name: { $ifNull: ['$service.name', 'Unknown'] }, count: 1 } },
      { $sort: { count: -1 } },
    ]),
    ServiceLog.aggregate([
      { $match: { organizationId: orgObjId, completedAt: { $gte: since } } },
      {
        $group: {
          _id: '$hourOfDay',
          count: { $sum: 1 },
          avgWaitMin: { $avg: { $divide: ['$waitTimeSec', 60] } },
          avgDurationMin: { $avg: { $divide: ['$durationSec', 60] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ServiceLog.aggregate([
      { $match: { organizationId: orgObjId, completedAt: { $gte: since } } },
      {
        $group: {
          _id: '$counterId',
          served: { $sum: 1 },
          avgDurationMin: { $avg: { $divide: ['$durationSec', 60] } },
        },
      },
      { $lookup: { from: 'counters', localField: '_id', foreignField: '_id', as: 'counter' } },
      { $unwind: { path: '$counter', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          counterName: { $ifNull: ['$counter.name', 'Counter'] },
          served: 1,
          avgDurationMin: { $round: ['$avgDurationMin', 1] },
        },
      },
    ]),
  ]);

  return {
    tokensPerDay: tokensPerDay.map((d) => ({
      date: d._id,
      total: d.total,
      completed: d.completed,
      cancelled: d.cancelled,
      noShow: d.noShow,
      noShowRate: d.total > 0 ? Number(((d.noShow / d.total) * 100).toFixed(1)) : 0,
    })),
    statusBreakdown: statusBreakdown.map((s) => ({ status: s._id, count: s.count })),
    servicePopularity,
    peakHours: hourlyStats.map((h) => ({
      hour: `${String(h._id).padStart(2, '0')}:00`,
      served: h.count,
      avgWaitMin: Number((h.avgWaitMin || 0).toFixed(1)),
      avgDurationMin: Number((h.avgDurationMin || 0).toFixed(1)),
    })),
    counterUtilization: counterPerf,
  };
}
