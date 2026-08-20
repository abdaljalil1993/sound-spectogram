import { NextFunction, Request, Response } from "express";
import { DeviceService } from "../services/device.service";
import { HttpError } from "../utils/http-error";
import { isPositiveInteger } from "../utils/validation";

const deviceService = new DeviceService();

export const deviceController = {
  createDevice: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description } = req.body as {
        name?: string;
        description?: string;
      };

      if (!name) {
        throw new HttpError(400, "name is required");
      }

      const device = await deviceService.createDevice({ name, description });
      res.status(201).json(device);
    } catch (error) {
      next(error);
    }
  },

  getDevices: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const devices = await deviceService.getDevices();
      res.json(devices);
    } catch (error) {
      next(error);
    }
  },

  getDeviceById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!isPositiveInteger(id)) {
        throw new HttpError(400, "id must be a positive integer");
      }

      const device = await deviceService.getDeviceById(id);
      res.json(device);
    } catch (error) {
      next(error);
    }
  },

  updateDevice: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!isPositiveInteger(id)) {
        throw new HttpError(400, "id must be a positive integer");
      }

      const { name, description } = req.body as {
        name?: string;
        description?: string | null;
      };

      const updated = await deviceService.updateDevice(id, { name, description });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },

  deleteDevice: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!isPositiveInteger(id)) {
        throw new HttpError(400, "id must be a positive integer");
      }

      await deviceService.deleteDevice(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
};
