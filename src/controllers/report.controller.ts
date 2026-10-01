import { NextFunction, Request, Response } from "express";
import { ReportService } from "../services/report.service";
import { HttpError } from "../utils/http-error";
import { isPositiveInteger } from "../utils/validation";

const reportService = new ReportService();

function requireAuthorizedUser(req: Request) {
  if (!req.user) {
    throw new HttpError(401, "Authentication required");
  }

  return req.user;
}

function getFirstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function parseOptionalPositiveIntegerQuery(value: unknown, fieldName: string): number | undefined {
  const raw = getFirstQueryValue(value);
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }

  const parsed = Number(raw);
  if (!isPositiveInteger(parsed)) {
    throw new HttpError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function parseOptionalDateQuery(value: unknown): string | undefined {
  const raw = getFirstQueryValue(value);
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed || undefined;
}

export const reportController = {
  createReport: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireAuthorizedUser(req);
      const { content } = req.body as { content?: string };
      const report = await reportService.createReport(user, content || "");
      res.status(201).json(report);
    } catch (error) {
      next(error);
    }
  },

  updateReport: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireAuthorizedUser(req);
      const id = Number(req.params.id);
      if (!isPositiveInteger(id)) {
        throw new HttpError(400, "id must be a positive integer");
      }

      const { content } = req.body as { content?: string };
      const report = await reportService.updateReport(user, id, content || "");
      res.json(report);
    } catch (error) {
      next(error);
    }
  },

  deleteReport: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireAuthorizedUser(req);
      const id = Number(req.params.id);
      if (!isPositiveInteger(id)) {
        throw new HttpError(400, "id must be a positive integer");
      }

      await reportService.deleteReport(user, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  deleteReports: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireAuthorizedUser(req);
      const { ids } = req.body as { ids?: unknown };
      const result = await reportService.deleteReports(user, Array.isArray(ids) ? ids.map((id) => Number(id)) : []);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  getReports: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireAuthorizedUser(req);
      const reports = await reportService.getReports(user, {
        page: parseOptionalPositiveIntegerQuery(req.query.page, "page"),
        pageSize: parseOptionalPositiveIntegerQuery(req.query.pageSize, "pageSize"),
        userId: parseOptionalPositiveIntegerQuery(req.query.userId, "userId"),
        date: parseOptionalDateQuery(req.query.date)
      });

      res.json(reports);
    } catch (error) {
      next(error);
    }
  }
};