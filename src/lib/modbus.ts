// Web Serial API implementation for Modbus RTU
// (Handles Function 0x03 Read Holding Registers and 0x06 Write Single Register)

export class WebSerialModbus {
  private port: any = null;
  private writer: any = null;
  private reader: any = null;
  private readBuffer: number[] = [];
  private isBusy = false;

  async connect(baudRate = 115200) {
    if (!('serial' in navigator)) {
      throw new Error("Web Serial API is not supported in this browser. Please use Chrome or Edge.");
    }
    
    try {
      // Request port selection from user
      this.port = await (navigator as any).serial.requestPort();
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        throw new Error("No port selected.");
      }
      throw err;
    }

    try {
      await this.port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' });
    } catch (err: any) {
      throw new Error(`Failed to open serial port: ${err.message}`);
    }
    
    this.writer = this.port.writable?.getWriter();
    this.startReadLoop();
  }

  async disconnect() {
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }
    if (this.writer) {
      await this.writer.close();
      this.writer.releaseLock();
    }
    if (this.port) {
      await this.port.close();
    }
    this.port = null;
  }

  private async startReadLoop() {
    if (!this.port?.readable) return;
    this.reader = this.port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) {
          this.reader.releaseLock();
          break;
        }
        if (value) {
          this.readBuffer.push(...Array.from(value as Uint8Array));
        }
      }
    } catch (e) {
      console.error("Serial read error", e);
    }
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private crc16(buffer: Uint8Array): [number, number] {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if ((crc & 1) !== 0) {
          crc >>= 1;
          crc ^= 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    return [crc & 0xFF, (crc >> 8) & 0xFF]; // Lo, Hi
  }

  async writeSingleRegister(slave: number, address: number, value: number): Promise<boolean> {
    if (!this.writer || this.isBusy) return false;
    this.isBusy = true;
    try {
      const frame = new Uint8Array(6);
      frame[0] = slave;
      frame[1] = 0x06;
      frame[2] = (address >> 8) & 0xFF;
      frame[3] = address & 0xFF;
      frame[4] = (value >> 8) & 0xFF;
      frame[5] = value & 0xFF;
      
      const crc = this.crc16(frame);
      const fullFrame = new Uint8Array([...frame, crc[0], crc[1]]);
      
      this.readBuffer = []; // clear buffer before sending
      await this.writer.write(fullFrame);
      
      // Wait for echo response (8 bytes)
      await this.waitForBytes(8, 200);
      return this.readBuffer.length >= 8;
    } catch (e) {
      console.error("Modbus Write Error", e);
      return false;
    } finally {
      this.isBusy = false;
    }
  }

  async readHoldingRegisters(slave: number, address: number, quantity: number): Promise<number[] | null> {
    if (!this.writer || this.isBusy) return null;
    this.isBusy = true;
    try {
      const frame = new Uint8Array(6);
      frame[0] = slave;
      frame[1] = 0x03;
      frame[2] = (address >> 8) & 0xFF;
      frame[3] = address & 0xFF;
      frame[4] = (quantity >> 8) & 0xFF;
      frame[5] = quantity & 0xFF;
      
      const crc = this.crc16(frame);
      const fullFrame = new Uint8Array([...frame, crc[0], crc[1]]);
      
      this.readBuffer = [];
      await this.writer.write(fullFrame);
      
      const expectedSize = 3 + (quantity * 2) + 2;
      await this.waitForBytes(expectedSize, 200);
      
      if (this.readBuffer.length >= expectedSize) {
        const dataBytes = this.readBuffer.slice(3, 3 + (quantity * 2));
        const registers = [];
        for (let i = 0; i < quantity; i++) {
          registers.push((dataBytes[i*2] << 8) | dataBytes[i*2 + 1]);
        }
        return registers;
      }
      return null;
    } catch (e) {
      console.error("Modbus Read Error", e);
      return null;
    } finally {
      this.isBusy = false;
    }
  }
  
  private async waitForBytes(count: number, timeoutMs: number) {
    const start = Date.now();
    while (this.readBuffer.length < count) {
      if (Date.now() - start > timeoutMs) {
        break;
      }
      await this.delay(10);
    }
  }
}

// Global singleton for the app
export const modbusClient = new WebSerialModbus();
