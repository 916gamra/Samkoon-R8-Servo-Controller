export type Role = "User" | "Admin";

export interface ModbusState {
  isConnected: boolean;
  portName?: string;
}

export function calculateRegister(group: number, parameter: number, writeToRam: boolean = false): number {
  let address = (group << 8) + parameter;
  if (writeToRam) {
    address += 0x8000;
  }
  return address;
}
