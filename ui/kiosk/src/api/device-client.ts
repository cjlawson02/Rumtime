import type {
  BottleSizeCommand,
  DeviceStatus,
  InventoryLevelCommand,
  PourCommand,
  PrimedCommand,
  PumpBindingCommand,
  PumpCalibrationCommand,
  PumpDispenseCommand,
  RefillCommand,
} from '@/api/types';

export type GetStatusOptions = {
  signal?: AbortSignal;
};

/** Device transport boundary — HTTP client; MSW intercepts in dev. */
export interface DeviceClient {
  getStatus(options?: GetStatusOptions): Promise<DeviceStatus>;
  startPour(command: PourCommand): Promise<void>;
  cancelPour(): Promise<void>;
  acknowledgePrompt(): Promise<void>;
  refillIngredient(command: RefillCommand): Promise<void>;
  updatePumpBinding(command: PumpBindingCommand): Promise<void>;
  updateBottleSize(command: BottleSizeCommand): Promise<void>;
  updateInventoryLevel(command: InventoryLevelCommand): Promise<void>;
  updatePumpCalibration(command: PumpCalibrationCommand): Promise<void>;
  updatePrimed(command: PrimedCommand): Promise<void>;
  startPumpDispense(command: PumpDispenseCommand): Promise<void>;
  cancelPumpDispense(): Promise<void>;
}

export { DEFAULT_DEVICE_API_BASE as DEVICE_API_BASE } from '@/lib/device-endpoint';
