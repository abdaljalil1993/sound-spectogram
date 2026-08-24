import { NextFunction, Request, Response } from "express";
import { HistoryService } from "../services/history.service";
import { HttpError } from "../utils/http-error";
import { isPositiveInteger } from "../utils/validation";

const historyService = new HistoryService();

export const historyController = {
  getDeviceHistory: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deviceId = Number(req.params.id);
      if (!isPositiveInteger(deviceId)) {
        throw new HttpError(400, "device id must be a positive integer");
      }

      const { from, to } = req.query as { from?: string; to?: string };

      if (from || to) {
        if (!from || !to) {
          throw new HttpError(400, "both from and to are required for range queries");
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);
        const items = await historyService.getHistoryByDateRange(deviceId, fromDate, toDate);
        console.info("[HistoryController] Range query", {
          deviceId,
          from,
          to,
          count: items.length
        });
        res.json(items);
        return;
      }

      const items = await historyService.getLatest24Hours(deviceId);
      console.info("[HistoryController] Latest24 query", {
        deviceId,
        count: items.length
      });
      res.json(items);
    } catch (error) {
      next(error);
    }
  }
};
