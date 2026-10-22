const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORTS = ['COM7', 'COM8', 'COM9'];
const DURATION_MS = 20000;

console.log('=== GridSense 3-Port Cross-Validation Diagnostic ===');
console.log(`Target Ports: ${PORTS.join(', ')} @ 115200 baud`);
console.log(`Listening for ${DURATION_MS / 1000} seconds...\n`);

const portHandles = {};
const logs = { COM7: [], COM8: [], COM9: [] };
const deviceIdentity = { COM7: 'Unknown', COM8: 'Unknown', COM9: 'Unknown' };

PORTS.forEach((portName) => {
  try {
    const port = new SerialPort({ path: portName, baudRate: 115200, autoOpen: false });
    
    port.open((err) => {
      if (err) {
        console.error(`[${portName}] Failed to open: ${err.message}`);
        deviceIdentity[portName] = `LOCKED / ERROR (${err.message})`;
        return;
      }
      console.log(`[${portName}] Successfully OPENED.`);
      portHandles[portName] = port;

      const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
      parser.on('data', (raw) => {
        const line = raw.trim();
        if (!line) return;
        const ts = new Date().toISOString().substring(11, 23);
        logs[portName].push({ ts, line });
        console.log(`[${ts}] [${portName}] ${line}`);

        // Identify device
        if (line.includes('Gateway') || line.includes('[GW') || line.includes('Central Gateway')) {
          deviceIdentity[portName] = 'Central Gateway';
        } else if (line.includes('POLE_ID: 1') || line.includes('Pole 1') || line.includes('POLE 1') || line.includes('"pole":1') || line.includes('Pole: 1') || line.includes('Pole #1')) {
          if (deviceIdentity[portName] === 'Unknown') deviceIdentity[portName] = 'Edge Node (Pole 1)';
        } else if (line.includes('POLE_ID: 2') || line.includes('Pole 2') || line.includes('POLE 2') || line.includes('"pole":2') || line.includes('Pole: 2') || line.includes('Pole #2')) {
          if (deviceIdentity[portName] === 'Unknown') deviceIdentity[portName] = 'Edge Node (Pole 2)';
        }
      });
    });
  } catch (e) {
    console.error(`[${portName}] Exception: ${e.message}`);
  }
});

setTimeout(() => {
  console.log('\n======================================================');
  console.log('              PORT CAPTURE COMPLETED                  ');
  console.log('======================================================');
  PORTS.forEach((p) => {
    console.log(`Port ${p}: Identity = [${deviceIdentity[p]}], Captured Lines = ${logs[p].length}`);
    if (portHandles[p] && portHandles[p].isOpen) {
      portHandles[p].close();
    }
  });

  // Dump detailed summary JSON to stdout
  console.log('\n--- CAPTURED DATA BREAKDOWN ---');
  PORTS.forEach((p) => {
    console.log(`\n>>> ${p} (${deviceIdentity[p]}):`);
    logs[p].slice(-20).forEach((item) => console.log(`   [${item.ts}] ${item.line}`));
  });
  
  process.exit(0);
}, DURATION_MS);
