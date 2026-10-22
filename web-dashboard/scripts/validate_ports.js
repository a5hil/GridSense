const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORTS = ['COM7', 'COM8', 'COM9'];
const DURATION_MS = 25000;

console.log('================================================================');
console.log('       GridSense Real-Time Multi-Port Telemetry Validator       ');
console.log('================================================================');
console.log(`Target Ports: ${PORTS.join(', ')} @ 115200 baud`);
console.log(`Sampling Duration: ${DURATION_MS / 1000} seconds...\n`);

const portHandles = {};
const logs = { COM7: [], COM8: [], COM9: [] };
const deviceIdentity = { COM7: 'Unknown', COM8: 'Unknown', COM9: 'Unknown' };

// Telemetry event records for cross-correlation
const txEvents = []; // { ts, port, poleId, seq, payload }
const rxEvents = []; // { ts, port, poleId, seq, hops, rssi, snr, isDecrypted, isDup, raw }
const fdirEvents = []; // { ts, status, fault, idiff }

PORTS.forEach((portName) => {
  try {
    const port = new SerialPort({ path: portName, baudRate: 115200, autoOpen: false });
    
    port.open((err) => {
      if (err) {
        console.error(`[${portName}] Failed to open: ${err.message}`);
        deviceIdentity[portName] = `LOCKED / ERROR (${err.message})`;
        return;
      }
      console.log(`[${portName}] Port Opened Successfully.`);
      portHandles[portName] = port;

      const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
      parser.on('data', (raw) => {
        const line = raw.trim();
        if (!line) return;
        const ts = new Date().toISOString().substring(11, 23);
        logs[portName].push({ ts, line });

        // Print real-time line
        console.log(`[${ts}] [${portName}] ${line}`);

        // Device role detection
        if (line.includes('Central Gateway') || line.includes('[GW')) {
          deviceIdentity[portName] = 'Central Gateway';
        } else if (line.includes('Pole #1') || line.includes('POLE #1')) {
          deviceIdentity[portName] = 'Edge Node (Pole 1)';
        } else if (line.includes('Pole #2') || line.includes('POLE #2')) {
          deviceIdentity[portName] = 'Edge Node (Pole 2)';
        }

        // Track Node TX events
        const txMatch = line.match(/\[POLE #(\d+) TX OK\] >>> (GS2\|\d+\|\d+\|\d+\|(\d+)\|.*?)/);
        if (txMatch) {
          txEvents.push({
            ts,
            port: portName,
            poleId: parseInt(txMatch[1]),
            seq: parseInt(txMatch[3]),
            raw: txMatch[2],
          });
        }

        // Track Gateway RX events
        const rxMatch = line.match(/\[GW RX GS\d+\] Pole: (\d+) \| Relay: (\d+) \| Seq: (\d+) \| TTL: (\d+) \| Hops: (\d+) \| Mask: (0x[0-9A-Fa-f]+)(.*?)/);
        if (rxMatch) {
          rxEvents.push({
            ts,
            poleId: parseInt(rxMatch[1]),
            relayId: parseInt(rxMatch[2]),
            seq: parseInt(rxMatch[3]),
            hops: parseInt(rxMatch[5]),
            mask: rxMatch[6],
            isDecrypted: rxMatch[7].includes('AES-128'),
            isDup: false,
          });
        }

        // Track Gateway Deduplication events
        const dedupMatch = line.match(/\[GW DEDUP\] Dropping duplicate packet from Pole (\d+) \(Seq (\d+) \| Hops: (\d+)\)/);
        if (dedupMatch) {
          rxEvents.push({
            ts,
            poleId: parseInt(dedupMatch[1]),
            relayId: 0,
            seq: parseInt(dedupMatch[2]),
            hops: parseInt(dedupMatch[3]),
            isDup: true,
          });
        }

        // Track Gateway FDIR Telemetry JSON
        if (line.startsWith('{"gw_ms":') && line.includes('"fault":')) {
          try {
            const p = JSON.parse(line);
            fdirEvents.push({
              ts,
              status: p.status,
              fault: p.fault,
              fault_phase: p.fault_phase,
              idiff: p.idiff,
              v1: p.p1?.v,
              v2: p.p2?.v,
            });
          } catch {}
        }
      });
    });
  } catch (e) {
    console.error(`[${portName}] Error: ${e.message}`);
  }
});

setTimeout(() => {
  console.log('\n================================================================');
  console.log('             MULTI-PORT VALIDATION SUMMARY REPORT               ');
  console.log('================================================================\n');

  // 1. Port Identification
  console.log('1. DEVICE & PORT ASSIGNMENTS:');
  PORTS.forEach((p) => {
    console.log(`   - ${p.padEnd(6)}: ${deviceIdentity[p]} (Captured: ${logs[p].length} lines)`);
    if (portHandles[p] && portHandles[p].isOpen) portHandles[p].close();
  });

  // 2. Transmit vs Receive Matrix
  const p1Tx = txEvents.filter((e) => e.poleId === 1);
  const p2Tx = txEvents.filter((e) => e.poleId === 2);
  const p1Rx = rxEvents.filter((e) => e.poleId === 1 && !e.isDup);
  const p2Rx = rxEvents.filter((e) => e.poleId === 2 && !e.isDup);
  const dups = rxEvents.filter((e) => e.isDup);

  console.log('\n2. PACKET DELIVERY & RF INTEGRITY MATRIX:');
  console.log(`   - Pole 1 (Incomer)  : Transmitted = ${p1Tx.length} pkts | Gateway Received = ${p1Rx.length} pkts | Delivery Rate = ${p1Tx.length > 0 ? ((p1Rx.length / p1Tx.length) * 100).toFixed(1) : '100'}%`);
  console.log(`   - Pole 2 (Outgoing) : Transmitted = ${p2Tx.length} pkts | Gateway Received = ${p2Rx.length} pkts | Delivery Rate = ${p2Tx.length > 0 ? ((p2Rx.length / p2Tx.length) * 100).toFixed(1) : '100'}%`);
  console.log(`   - Mesh Deduplication: Relayed duplicate packets successfully filtered = ${dups.length}`);

  // 3. Timing / Staggering Analysis
  console.log('\n3. INTER-POLE TRANSMISSION TIMING (COLLISION CHECK):');
  if (txEvents.length >= 2) {
    for (let i = 1; i < txEvents.length; i++) {
      const prev = txEvents[i - 1];
      const curr = txEvents[i];
      if (prev.poleId !== curr.poleId) {
        console.log(`   - Pole ${prev.poleId} (Seq ${prev.seq} @ ${prev.ts}) -> Pole ${curr.poleId} (Seq ${curr.seq} @ ${curr.ts})`);
      }
    }
  } else {
    console.log('   - Insufficient TX events logged to compute timing spacing.');
  }

  // 4. Central FDIR Engine Decision
  console.log('\n4. CENTRAL FDIR DECISION STATE:');
  if (fdirEvents.length > 0) {
    const last = fdirEvents[fdirEvents.length - 1];
    console.log(`   - Status Verdict : [${last.status}]`);
    console.log(`   - Fault Type     : ${last.fault} (Phase ${last.fault_phase})`);
    console.log(`   - Voltage Span   : V1 = ${last.v1} V | V2 = ${last.v2} V`);
    console.log(`   - Idiff Leakage  : ${last.idiff} A`);
  } else {
    console.log('   - No FDIR JSON events captured during sampling period.');
  }

  console.log('\n================================================================\n');
  process.exit(0);
}, DURATION_MS);
