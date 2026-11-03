import { SerialPort } from "serialport";

export interface SerialCommandResult {
  success: boolean;
  port: string;
  command: string;
  response?: string;
  error?: string;
}

export class HardwareSerialController {
  private pole1Port: string;
  private pole2Port: string;
  private gatewayPort: string;
  private baudRate: number;

  constructor() {
    this.pole1Port = process.env.POLE1_PORT || "COM7";
    this.pole2Port = process.env.POLE2_PORT || "COM9";
    this.gatewayPort = process.env.GATEWAY_PORT || "COM8";
    this.baudRate = 115200;
  }

  /**
   * Send single-character scenario injection command to EdgeNode
   * 'n' -> Normal Balanced Grid
   * 'd' -> Differential Leakage Fault
   * 'y' -> Broken Conductor Phase Y
   * 'b' -> Broken Neutral / Voltage Shift
   * 'o' -> Overcurrent Overload
   * 'p' -> Powercut 0V / Outage Last Gasp
   */
  public async sendCommand(pole: 1 | 2, commandChar: string, waitAfterMs = 3000): Promise<SerialCommandResult> {
    const targetPort = pole === 1 ? this.pole1Port : this.pole2Port;
    const char = commandChar.trim().charAt(0);

    const tryOpenAndSend = async (attempt: number): Promise<SerialCommandResult> => {
      return new Promise<SerialCommandResult>((resolve) => {
        let output = "";
        const port = new SerialPort({
          path: targetPort,
          baudRate: this.baudRate,
          autoOpen: false,
        });

        port.open(async (err) => {
          if (err) {
            if (attempt < 3) {
              console.warn(`[HardwareSerial] Port ${targetPort} busy on attempt ${attempt} (${err.message}). Retrying in 600ms...`);
              await new Promise((r) => setTimeout(r, 600));
              resolve(await tryOpenAndSend(attempt + 1));
              return;
            }
            console.warn(`[HardwareSerial] Warning: could not open ${targetPort} (${err.message}) after 3 attempts`);
            resolve({
              success: false,
              port: targetPort,
              command: char,
              error: err.message,
            });
            return;
          }

          port.on("data", (data) => {
            output += data.toString();
          });

          // Write command with newline
          port.write(`${char}\n`, (writeErr) => {
            if (writeErr) {
              port.close(() => {
                resolve({
                  success: false,
                  port: targetPort,
                  command: char,
                  error: writeErr.message,
                });
              });
              return;
            }

            port.drain(() => {
              // Give 350ms to capture immediate response from firmware, then release the port
              setTimeout(() => {
                try {
                  if (port.isOpen) {
                    port.close(() => {
                      // Wait for RF LoRa Sub-GHz propagation and Gateway FDIR evaluation
                      setTimeout(() => {
                        resolve({
                          success: true,
                          port: targetPort,
                          command: char,
                          response: output.trim(),
                        });
                      }, waitAfterMs);
                    });
                  } else {
                    setTimeout(() => {
                      resolve({
                        success: true,
                        port: targetPort,
                        command: char,
                        response: output.trim(),
                      });
                    }, waitAfterMs);
                  }
                } catch (closeErr: any) {
                  resolve({
                    success: true,
                    port: targetPort,
                    command: char,
                    error: closeErr.message,
                  });
                }
              }, 350);
            });
          });
        });
      });
    };

    return tryOpenAndSend(1);
  }

  /**
   * Reset both EdgeNodes to Normal balanced operation ('n')
   */
  public async resetAllToNormal(): Promise<void> {
    await this.sendCommand(1, "n", 1500);
    await this.sendCommand(2, "n", 2500);
  }
}

export const serialController = new HardwareSerialController();

