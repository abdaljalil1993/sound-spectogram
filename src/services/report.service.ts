import { Between, FindOptionsWhere, In, Repository } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Report } from "../entities/Report";
import { UserRole } from "../entities/User";
import { HttpError } from "../utils/http-error";
import { AuthorizedUser } from "../utils/types";
import { isPositiveInteger, normalizeNaiveDateTimeString } from "../utils/validation";

interface GetReportsOptions {
  page?: number;
  pageSize?: number;
  userId?: number;
  date?: string;
}

interface ReportListItem {
  id: number;
  content: string;
  createdByUserId: number | null;
  createdByNameSnapshot: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ReportService {
  private static readonly MAX_BULK_DELETE_IDS = 500;

  private readonly reportRepo: Repository<Report>;

  constructor() {
    this.reportRepo = AppDataSource.getRepository(Report);
  }

  private normalizeContent(content: string): string {
    if (typeof content !== "string") {
      throw new HttpError(400, "content must be a non-empty string");
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new HttpError(400, "content must be a non-empty string");
    }

    return trimmed;
  }

  private requireReportId(reportId: number): void {
    if (!isPositiveInteger(reportId)) {
      throw new HttpError(400, "reportId must be a positive integer");
    }
  }

  private async requireReport(reportId: number): Promise<Report> {
    this.requireReportId(reportId);

    const report = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!report) {
      throw new HttpError(404, "Report not found");
    }

    return report;
  }

  private normalizeBulkDeleteIds(reportIds: number[]): number[] {
    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      throw new HttpError(400, "ids must be a non-empty array of positive integers");
    }

    const uniqueIds = Array.from(new Set(reportIds.map((reportId) => Number(reportId))));
    if (uniqueIds.some((reportId) => !isPositiveInteger(reportId))) {
      throw new HttpError(400, "ids must be a non-empty array of positive integers");
    }

    if (uniqueIds.length > ReportService.MAX_BULK_DELETE_IDS) {
      throw new HttpError(400, `ids cannot contain more than ${ReportService.MAX_BULK_DELETE_IDS} items`);
    }

    return uniqueIds;
  }

  private resolveDateRangeForDay(date: string): { from: Date; to: Date } {
    const trimmed = typeof date === "string" ? date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new HttpError(400, "date must be in YYYY-MM-DD format");
    }

    const normalizedFrom = normalizeNaiveDateTimeString(`${trimmed}T00:00:00`);
    const normalizedTo = normalizeNaiveDateTimeString(`${trimmed}T23:59:59.999`);
    if (!normalizedFrom || !normalizedTo) {
      throw new HttpError(400, "date must be in YYYY-MM-DD format");
    }

    const from = new Date(normalizedFrom);
    const to = new Date(normalizedTo);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
      throw new HttpError(400, "date must be in YYYY-MM-DD format");
    }

    return { from, to };
  }

  private normalizePage(value: number | undefined, fieldName: "page" | "pageSize", defaultValue: number): number {
    if (value === undefined) {
      return defaultValue;
    }

    if (!Number.isInteger(value) || value <= 0) {
      throw new HttpError(400, `${fieldName} must be a positive integer`);
    }

    return value;
  }

  async createReport(user: AuthorizedUser, content: string): Promise<Report> {
    const normalizedContent = this.normalizeContent(content);

    const report = this.reportRepo.create({
      content: normalizedContent,
      createdByUserId: user.id,
      createdByNameSnapshot: user.name,
      createdBy: null
    });

    return this.reportRepo.save(report);
  }

  async updateReport(user: AuthorizedUser, reportId: number, content: string): Promise<Report> {
    const report = await this.requireReport(reportId);
    const normalizedContent = this.normalizeContent(content);

    if (user.role === UserRole.EMP && report.createdByUserId !== user.id) {
      throw new HttpError(403, "You do not have permission to edit this report");
    }

    report.content = normalizedContent;
    return this.reportRepo.save(report);
  }

  async deleteReport(user: AuthorizedUser, reportId: number): Promise<void> {
    if (user.role !== UserRole.ADMIN) {
      throw new HttpError(403, "You do not have permission to delete reports");
    }

    const report = await this.requireReport(reportId);
    await this.reportRepo.delete(report.id);
  }

  async deleteReports(user: AuthorizedUser, reportIds: number[]): Promise<{ deletedCount: number }> {
    if (user.role !== UserRole.ADMIN) {
      throw new HttpError(403, "You do not have permission to delete reports");
    }

    const normalizedIds = this.normalizeBulkDeleteIds(reportIds);
    const result = await this.reportRepo.delete({ id: In(normalizedIds) });

    return {
      deletedCount: result.affected || 0
    };
  }

  async getReports(
    user: AuthorizedUser,
    options: GetReportsOptions
  ): Promise<{ items: ReportListItem[]; total: number; page: number; pageSize: number }> {
    const page = this.normalizePage(options.page, "page", 1);
    const requestedPageSize = this.normalizePage(options.pageSize, "pageSize", 20);
    const pageSize = Math.min(requestedPageSize, 100);

    const where: FindOptionsWhere<Report> = {};

    if (user.role === UserRole.EMP) {
      where.createdByUserId = user.id;
    } else {
      if (options.userId !== undefined) {
        if (!isPositiveInteger(options.userId)) {
          throw new HttpError(400, "userId must be a positive integer");
        }

        where.createdByUserId = options.userId;
      }

      if (options.date !== undefined) {
        const range = this.resolveDateRangeForDay(options.date);
        where.createdAt = Between(range.from, range.to);
      }
    }

    const [items, total] = await this.reportRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        content: item.content,
        createdByUserId: item.createdByUserId,
        createdByNameSnapshot: item.createdByNameSnapshot,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      })),
      total,
      page,
      pageSize
    };
  }
}